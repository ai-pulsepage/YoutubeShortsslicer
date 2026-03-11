/**
 * POST /api/voiceover/preview
 *
 * Generate a TTS voice preview using ElevenLabs or XTTS v2.
 */

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { generateVoiceover, TtsEngine } from "@/lib/tts";
import type { NarratorStyle } from "@/lib/tts";
import { cleanNarrationText } from "@/lib/documentary/assembler";

export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { text, voiceId, speed, engine, narratorStyle, speakerWav } = body;

    if (!text || !voiceId) {
        return NextResponse.json(
            { error: "Missing required fields: text, voiceId" },
            { status: 400 }
        );
    }

    if (text.length > 5000) {
        return NextResponse.json(
            { error: "Text too long (max 5000 characters)" },
            { status: 400 }
        );
    }

    const ttsEngine: TtsEngine = engine || "elevenlabs";

    try {
        const audioBuffer = await generateVoiceover({
            text: cleanNarrationText(text),
            engine: ttsEngine,
            voiceId,
            speed: speed || undefined,
            narratorStyle: (narratorStyle as NarratorStyle) || "documentary",
            speakerWav,
        });

        // Determine content type based on engine
        const contentType = ttsEngine === "elevenlabs" ? "audio/mpeg" : "audio/wav";

        return new Response(new Uint8Array(audioBuffer), {
            headers: {
                "Content-Type": contentType,
                "Content-Length": audioBuffer.length.toString(),
            },
        });
    } catch (error: any) {
        console.error("[Voiceover] Preview failed:", error.message);
        return NextResponse.json(
            { error: "Voiceover generation failed", details: error.message },
            { status: 500 }
        );
    }
}
