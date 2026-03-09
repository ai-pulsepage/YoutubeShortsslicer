/**
 * GET /api/voiceover/voices
 *
 * Returns available voices for the specified TTS engine.
 * Query params: ?engine=elevenlabs or ?engine=xtts
 */

import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { listAvailableVoices, TtsEngine } from "@/lib/tts";

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const engine = req.nextUrl.searchParams.get("engine") as TtsEngine || "elevenlabs";

    if (!["elevenlabs", "xtts"].includes(engine)) {
        return NextResponse.json(
            { error: "Invalid engine. Use 'elevenlabs' or 'xtts'" },
            { status: 400 }
        );
    }

    try {
        const voices = await listAvailableVoices(engine);
        return NextResponse.json({ voices, engine });
    } catch (error: any) {
        console.error(`[Voices API] Failed to list ${engine} voices:`, error.message);
        return NextResponse.json(
            { error: `Failed to load voices: ${error.message}` },
            { status: 500 }
        );
    }
}
