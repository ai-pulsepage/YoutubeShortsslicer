import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listAvailableVoices, TtsEngine } from "@/lib/tts";
import { EDGE_TTS_VOICES_FULL } from "@/lib/tts/edge-voices";

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const engine = req.nextUrl.searchParams.get("engine") as TtsEngine | null;
    if (!engine) {
        return NextResponse.json({ error: "engine query param required" }, { status: 400 });
    }

    try {
        if (engine === "edge_tts") {
            return NextResponse.json({ voices: EDGE_TTS_VOICES_FULL });
        }
        const voices = await listAvailableVoices(engine);
        return NextResponse.json({ voices });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
