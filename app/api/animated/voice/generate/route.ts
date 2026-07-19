/**
 * Multi-provider TTS voice generation for the Kids AI Film Studio.
 *
 * Dispatches to one of 4 engines based on the `ttsProvider` field:
 *   edge_tts   → MoneyPrinter / Azure EdgeTTS (default, fast)
 *   gemini     → Gemini 2.5 Flash Preview TTS
 *   elevenlabs → ElevenLabs API (premium, natural)
 *   dia        → Dia TTS on RunPod (self-hosted, voice cloning)
 *
 * All engines produce an audio buffer → uploaded to R2 at the same key
 * pattern → narrationPath written to DocScene DB record.
 * The compile route is completely agnostic to which engine was used.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadFileToR2 } from "@/lib/storage";
import { applyStyleForElevenLabs } from "@/lib/tts/narrator-style";
import { stripTtsMarkup, applyStructuralMarkup, type TtsProvider } from "@/lib/tts/text-formatter";
import fs from "fs";
import path from "path";
import os from "os";


// ─── EdgeTTS via MoneyPrinter ─────────────────────────────────────────────────

async function synthesizeEdgeTTS(moneyPrinterUrl: string, text: string, voice: string): Promise<string> {
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
    if (!audioRes.ok) throw new Error(`EdgeTTS synthesis failed: ${await audioRes.text()}`);

    const createData = await audioRes.json();
    const taskId = (createData.data || createData).task_id;

    // Poll — MoneyPrinter retries EdgeTTS up to 3×30s internally → poll up to 120s
    for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const statusRes = await fetch(`${moneyPrinterUrl}/api/v1/tasks/${taskId}`);
        if (statusRes.ok) {
            const st = (await statusRes.json());
            const task = st.data || st;
            if (task.state === 1) return taskId;
            if (task.state === -1) throw new Error(`TTS_TIMEOUT: EdgeTTS failed for voice "${voice}"`);
        }
    }
    throw new Error(`TTS_TIMEOUT: EdgeTTS timed out for voice "${voice}"`);
}

async function generateEdgeTTSBuffer(moneyPrinterUrl: string, text: string, voice: string, tempDir: string): Promise<Buffer> {
    const taskId = await synthesizeEdgeTTS(moneyPrinterUrl, text, voice);
    const audioFetch = await fetch(`${moneyPrinterUrl}/tasks/${taskId}/audio.mp3`);
    if (!audioFetch.ok) throw new Error("Failed to download EdgeTTS audio file");
    const buf = Buffer.from(await audioFetch.arrayBuffer());
    return buf;
}

// ─── Main Route ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const {
        docId,
        sceneId,
        text,
        // Legacy: voice alone means edge_tts
        voice,
        // New multi-provider fields
        ttsProvider = "edge_tts",
        ttsVoiceId,
    } = await req.json();

    if (!sceneId || !text) {
        return NextResponse.json({ error: "sceneId and text are required" }, { status: 400 });
    }

    const activeProvider: string = ttsProvider || "edge_tts";
    // Resolve effective voice: new ttsVoiceId takes priority, fallback to legacy voice field
    const effectiveVoice: string = ttsVoiceId || voice || "en-US-AnaNeural-Female";

    const moneyPrinterUrl = process.env.MONEY_PRINTER_URL || "http://localhost:8085";
    const activeDocId = docId || `temp-voice-${Date.now()}`;
    const tempDir = path.join(os.tmpdir(), `voice-gen-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
        console.log(`[Voice Gen] Scene ${sceneId} | provider: ${activeProvider} | voice: ${effectiveVoice}`);

        // ── Text preprocessing per engine ────────────────────────────────────
        // 1. Dia cues ((laughs), (sighs) etc.) are content authored for Dia only.
        //    Strip them if any other engine is rendering so they don't get spoken literally.
        // 2. ElevenLabs: apply SSML <break> structural markup (not stored in DB, applied here only).
        // 3. Edge TTS: wrap in SSML <speak> with <prosody> tags for [emotion] markers + ... → <break>.
        // 4. Gemini: clean plain text — no special prep needed.
        let synthesisText = text;

        if (activeProvider !== "dia") {
            // Strip Dia cues so they aren't read aloud as "(laughs)" by Edge/Gemini/ElevenLabs
            synthesisText = stripTtsMarkup(synthesisText, "dia");
        }

        if (activeProvider === "elevenlabs") {
            // Auto-apply SSML break tags for natural pacing (documentary style default)
            synthesisText = applyStyleForElevenLabs(synthesisText, "documentary");
        }

        if (activeProvider === "edge_tts") {
            // Wrap in SSML <speak> with prosody emotion tags (handles [emotion] markers and ... → <break>)
            synthesisText = applyStructuralMarkup(synthesisText, "edge_tts", effectiveVoice);
        }

        console.log(`[Voice Gen] Text after preprocessing (${synthesisText.length} chars): "${synthesisText.slice(0, 120)}..."`);

        let audioBuffer: Buffer;
        let ext = "mp3";

        switch (activeProvider) {
            case "edge_tts": {
                if (!voice && !ttsVoiceId) throw new Error("voice or ttsVoiceId required for edge_tts");
                audioBuffer = await generateEdgeTTSBuffer(moneyPrinterUrl, synthesisText, effectiveVoice, tempDir);
                ext = "mp3";
                break;
            }

            case "gemini": {
                const { generateSpeech: geminiTTS } = await import("@/lib/tts/gemini");
                audioBuffer = await geminiTTS({ text: synthesisText, voiceId: effectiveVoice });
                ext = "wav"; // Gemini returns WAV
                break;
            }

            case "elevenlabs": {
                const { generateSpeech: elTTS } = await import("@/lib/tts/elevenlabs");
                audioBuffer = await elTTS({ text: synthesisText, voiceId: effectiveVoice });
                ext = "mp3";
                break;
            }

            case "dia": {
                const { generateSpeech: diaTTS } = await import("@/lib/tts/dia");
                audioBuffer = await diaTTS({ text: synthesisText, voiceRef: effectiveVoice, voiceMode: "predefined" });
                ext = "wav"; // Dia returns WAV
                break;
            }

            default:
                throw new Error(`Unknown TTS provider: ${activeProvider}`);
        }

        // Write to temp file and upload to R2
        const localAudioPath = path.join(tempDir, `audio.${ext}`);
        fs.writeFileSync(localAudioPath, audioBuffer);

        const r2Key = `animated/projects/${activeDocId}/voices/${sceneId}.${ext}`;
        await uploadFileToR2(localAudioPath, r2Key, ext === "wav" ? "audio/wav" : "audio/mpeg");

        fs.rmSync(tempDir, { recursive: true, force: true });

        // Persist narrationPath to DB immediately so it survives page reloads
        try {
            await prisma.docScene.update({
                where: { id: sceneId },
                data: { narrationPath: r2Key }
            });
        } catch (dbErr: any) {
            console.warn(`[Voice Gen] Could not persist narrationPath for scene ${sceneId}:`, dbErr.message);
        }

        return NextResponse.json({
            success: true,
            narrationPath: r2Key,
            providerUsed: activeProvider,
            voiceUsed: effectiveVoice,
        });

    } catch (err: any) {
        console.error("[Voice Gen] Process failed:", err.message);
        fs.rmSync(tempDir, { recursive: true, force: true });
        return NextResponse.json({ error: "Voice generation failed", details: err.message }, { status: 500 });
    }
}
