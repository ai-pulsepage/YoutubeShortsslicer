import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadFileToR2 } from "@/lib/storage";
import fs from "fs";
import path from "path";
import os from "os";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { docId, sceneId, text, voice } = await req.json();
    if (!sceneId || !text || !voice) {
        return NextResponse.json({ error: "sceneId, text and voice are required" }, { status: 400 });
    }

    const moneyPrinterUrl = process.env.MONEY_PRINTER_URL || "http://localhost:8080";
    const activeDocId = docId || `temp-voice-${Date.now()}`;
    const tempDir = path.join(os.tmpdir(), `voice-gen-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
        console.log(`[Voice Gen] Synthesizing for scene ${sceneId}: "${text}" using voice ${voice}`);

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

        // Poll for audio synthesis task completion
        let attempts = 0;
        let isDone = false;
        while (attempts < 15 && !isDone) {
            await new Promise(r => setTimeout(r, 1000));
            attempts++;
            const statusRes = await fetch(`${moneyPrinterUrl}/api/v1/tasks/${taskId}`);
            if (statusRes.ok) {
                const statusData = await statusRes.json();
                const statusTask = statusData.data || statusData;
                if (statusTask.state === 1) isDone = true;
            }
        }

        if (!isDone) {
            throw new Error(`TTS synthesis task timed out`);
        }

        // Download synthesized audio file
        const audioUrl = `${moneyPrinterUrl}/tasks/${taskId}/audio.mp3`;
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

        return NextResponse.json({
            success: true,
            narrationPath: r2Key
        });

    } catch (err: any) {
        console.error("[Voice Gen] Process failed:", err.message);
        fs.rmSync(tempDir, { recursive: true, force: true });
        return NextResponse.json({ error: "Voice generation failed", details: err.message }, { status: 500 });
    }
}
