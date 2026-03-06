import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { generateVoiceover } from "@/lib/tts";

/**
 * POST /api/voiceover/preview
 * Generate a TTS voice preview using Together.ai Kokoro
 */
export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { text, voiceId, speed } = body;

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

    try {
        const audioBuffer = await generateVoiceover({
            text,
            voiceId,
            speed: speed || 1.0,
        });

        return new Response(new Uint8Array(audioBuffer), {
            headers: {
                "Content-Type": "audio/wav",
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
