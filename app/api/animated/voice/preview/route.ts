import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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

    const { text, voice } = await req.json();
    if (!text || !voice) {
        return NextResponse.json({ error: "text and voice are required" }, { status: 400 });
    }

    try {
        console.log(`[Voice Preview] ElevenLabs previewing: "${text}" using voice ${voice}`);

        const voiceId = elevenLabsVoiceMapping[voice] || DEFAULT_ELEVENLABS_VOICE;

        const audioBuffer = await generateSpeech({
            text,
            voiceId,
            modelId: "eleven_multilingual_v2"
        });

        return new Response(new Uint8Array(audioBuffer), {
            headers: {
                "Content-Type": "audio/mpeg",
                "Content-Length": audioBuffer.byteLength.toString(),
            },
        });

    } catch (err: any) {
        console.error("[Voice Preview] failed:", err.message);
        return NextResponse.json({ error: "Voice preview failed", details: err.message }, { status: 500 });
    }
}
