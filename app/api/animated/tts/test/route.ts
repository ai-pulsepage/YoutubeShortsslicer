import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { diaHealthCheck, geminiHealthCheck } from "@/lib/tts";

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const engine = req.nextUrl.searchParams.get("engine");

    try {
        switch (engine) {
            case "gemini": {
                const result = await geminiHealthCheck();
                return NextResponse.json(result);
            }
            case "elevenlabs": {
                const { listVoices } = await import("@/lib/tts/elevenlabs");
                const voices = await listVoices();
                return NextResponse.json({ ok: true, message: `ElevenLabs connected — ${voices.length} voices available` });
            }
            case "dia": {
                const result = await diaHealthCheck();
                return NextResponse.json(result);
            }
            case "edge_tts": {
                const moneyPrinterUrl = process.env.MONEY_PRINTER_URL || "http://localhost:8085";
                const res = await fetch(`${moneyPrinterUrl}/api/v1/bgm`, { signal: AbortSignal.timeout(5000) });
                if (res.ok) {
                    return NextResponse.json({ ok: true, message: "Edge TTS (MoneyPrinter) connected" });
                }
                return NextResponse.json({ ok: false, message: `MoneyPrinter returned status ${res.status}` });
            }
            default:
                return NextResponse.json({ error: "Unknown engine" }, { status: 400 });
        }
    } catch (err: any) {
        return NextResponse.json({ ok: false, message: err.message });
    }
}
