import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadFileToR2 } from "@/lib/storage";
import fs from "fs";
import path from "path";
import os from "os";

// Voices that intermittently time out on EdgeTTS due to server network location.
// Maps primary voice -> reliable US fallback with same gender/tone.
const VOICE_FALLBACKS: Record<string, string> = {
    "en-GB-OliverNeural-Male":      "en-US-ChristopherNeural-Male",
    "en-GB-RyanNeural-Male":        "en-US-ChristopherNeural-Male",
    "en-GB-SoniaNeural-Female":     "en-US-AnaNeural-Female",
    "en-GB-LibbyNeural-Female":     "en-US-AnaNeural-Female",
    "en-AU-NatashaNeural-Female":   "en-US-AnaNeural-Female",
    "en-AU-WilliamNeural-Male":     "en-US-GuyNeural-Male",
};

async function synthesizeVoice(moneyPrinterUrl: string, text: string, voice: string): Promise<string> {
    const audioRes = await fetch(`${moneyPrinterUrl}/api/v1/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            video_script: text,
            voice_name: voice,
            bgm_type: "none",
            bgm_file: "",
            bgm_volume: 0,
            voice_volume: 1.0,
            voice_rate: 1.2
        })
    });

    if (!audioRes.ok) {
        throw new Error(`EdgeTTS synthesis failed: ${await audioRes.text()}`);
    }

    const createData = await audioRes.json();
    const task = createData.data || createData;
    const taskId = task.task_id;

    // Poll for completion. MoneyPrinter retries EdgeTTS up to 3 times internally,
    // each with a 30s timeout, so worst case is ~110s — poll up to 120s.
    let attempts = 0;
    let isDone = false;
    let isFailed = false;
    while (attempts < 120 && !isDone && !isFailed) {
        await new Promise(r => setTimeout(r, 1000));
        attempts++;
        const statusRes = await fetch(`${moneyPrinterUrl}/api/v1/tasks/${taskId}`);
        if (statusRes.ok) {
            const statusData = await statusRes.json();
            const statusTask = statusData.data || statusData;
            if (statusTask.state === 1) isDone = true;
            // state -1 means MoneyPrinter gave up after all internal retries
            if (statusTask.state === -1) isFailed = true;
        }
    }

    if (isFailed || !isDone) {
        throw new Error(`TTS_TIMEOUT: Voice synthesis failed for voice "${voice}" — all EdgeTTS retries exhausted`);
    }

    return taskId;
}

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { docId, sceneId, text, voice } = await req.json();
    if (!sceneId || !text || !voice) {
        return NextResponse.json({ error: "sceneId, text and voice are required" }, { status: 400 });
    }

    const moneyPrinterUrl = process.env.MONEY_PRINTER_URL || "http://localhost:8085";
    const activeDocId = docId || `temp-voice-${Date.now()}`;
    const tempDir = path.join(os.tmpdir(), `voice-gen-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
        let activeVoice = voice;
        let taskId: string;

        console.log(`[Voice Gen] Synthesizing for scene ${sceneId}: "${text}" using voice ${voice}`);

        try {
            taskId = await synthesizeVoice(moneyPrinterUrl, text, activeVoice);
        } catch (primaryErr: any) {
            // If the primary voice timed out AND we have a fallback, retry with US equivalent
            const fallback = VOICE_FALLBACKS[voice];
            if (primaryErr.message?.startsWith("TTS_TIMEOUT") && fallback) {
                console.warn(`[Voice Gen] Primary voice "${voice}" timed out. Retrying with fallback: "${fallback}"`);
                activeVoice = fallback;
                taskId = await synthesizeVoice(moneyPrinterUrl, text, activeVoice);
            } else {
                throw primaryErr;
            }
        }

        // Download synthesized audio file
        const audioUrl = `${moneyPrinterUrl}/tasks/${taskId!}/audio.mp3`;
        const audioFetch = await fetch(audioUrl);
        if (!audioFetch.ok) {
            throw new Error(`Failed to download synthesized audio file`);
        }
        const audioBuffer = await audioFetch.arrayBuffer();
        const localAudioPath = path.join(tempDir, "audio.mp3");
        fs.writeFileSync(localAudioPath, Buffer.from(audioBuffer));

        // Upload voiceover track to R2
        const r2Key = `animated/projects/${activeDocId}/voices/${sceneId}.mp3`;
        await uploadFileToR2(localAudioPath, r2Key, "audio/mpeg");

        // Clean up temp local folder
        fs.rmSync(tempDir, { recursive: true, force: true });

        // Persist narrationPath directly to the DocScene record so it survives
        // page reloads without requiring the user to manually click Save.
        try {
            await prisma.docScene.update({
                where: { id: sceneId },
                data: { narrationPath: r2Key }
            });
        } catch (dbErr: any) {
            // sceneId may be a temp client-only ID (project not yet saved) — log and continue
            console.warn(`[Voice Gen] Could not persist narrationPath to DB for scene ${sceneId}:`, dbErr.message);
        }

        return NextResponse.json({
            success: true,
            narrationPath: r2Key,
            // Tell the UI which voice was actually used (may differ if fallback triggered)
            voiceUsed: activeVoice,
            usedFallback: activeVoice !== voice
        });

    } catch (err: any) {
        console.error("[Voice Gen] Process failed:", err.message);
        fs.rmSync(tempDir, { recursive: true, force: true });
        return NextResponse.json({ error: "Voice generation failed", details: err.message }, { status: 500 });
    }
}
