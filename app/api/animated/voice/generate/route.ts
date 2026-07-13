import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadBufferToR2 } from "@/lib/storage";
import { generateSpeech } from "@/lib/tts/elevenlabs";

const elevenLabsVoiceMapping: Record<string, string> = {
    // Child Female
    "en-US-AnaNeural-Female": "jB5YdeoOVgp8tGgqkvGP", // Gigi
    "zh-CN-XiaoyiNeural-Female": "jB5YdeoOVgp8tGgqkvGP",
    // Child Male
    "en-US-ChristopherNeural-Male": "oWAO1G9P7FlgJh2rN7Fl", // Mimi/Clyde
    "en-GB-OliverNeural-Male": "oWAO1G9P7FlgJh2rN7Fl",
    // Adult Female
    "en-US-AriaNeural-Female": "21m00Tcm4TlvDq8ikWAM", // Rachel
    "en-GB-SoniaNeural-Female": "EXAVITQu4vr4xnSDxMaL", // Bella
    "zh-CN-XiaoxiaoNeural-Female": "21m00Tcm4TlvDq8ikWAM",
    // Adult Male
    "en-US-GuyNeural-Male": "JBF2r4c1tbx4gx6gx4X", // George
    "en-GB-RyanNeural-Male": "ErXwobaYiN019PkySvjV", // Antoni
    "zh-CN-YunxiNeural-Male": "pNInz6obpgq9GgVv6W8a", // Adam
};

const DEFAULT_ELEVENLABS_VOICE = "21m00Tcm4TlvDq8ikWAM"; // Rachel

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { docId, sceneId, text, voice } = await req.json();
    if (!sceneId || !text || !voice) {
        return NextResponse.json({ error: "sceneId, text and voice are required" }, { status: 400 });
    }

    const activeDocId = docId || `temp-voice-${Date.now()}`;

    try {
        console.log(`[Voice Gen] ElevenLabs synthesizing for scene ${sceneId}: "${text}" using voice ${voice}`);

        // Map EdgeTTS voice ID to ElevenLabs voice ID
        const voiceId = elevenLabsVoiceMapping[voice] || DEFAULT_ELEVENLABS_VOICE;

        // Generate audio buffer from ElevenLabs
        const audioBuffer = await generateSpeech({
            text,
            voiceId,
            modelId: "eleven_multilingual_v2"
        });

        // Upload voiceover track to R2
        const r2Key = `animated/projects/${activeDocId}/voices/${sceneId}.mp3`;
        await uploadBufferToR2(audioBuffer, r2Key, "audio/mpeg");

        return NextResponse.json({
            success: true,
            narrationPath: r2Key
        });

    } catch (err: any) {
        console.error("[Voice Gen] Process failed:", err.message);
        return NextResponse.json({ error: "Voice generation failed", details: err.message }, { status: 500 });
    }
}
