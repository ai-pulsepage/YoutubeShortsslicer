import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * POST /api/podcast/dia/preview — Generate a short voice preview
 *
 * Body: { voiceRef: string, text?: string }
 * Returns: audio/wav binary
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const diaUrl = process.env.DIA_TTS_URL;
  if (!diaUrl) {
    return NextResponse.json({ error: "Dia TTS not configured" }, { status: 503 });
  }

  try {
    const { voiceRef, text } = await req.json();
    if (!voiceRef) {
      return NextResponse.json({ error: "voiceRef required" }, { status: 400 });
    }

    const previewText = text || "Hey, this is what I sound like. Pretty natural, right? Let me know what you think.";

    // Import and use the generateSpeech function
    const { generateSpeech } = await import("@/lib/tts/dia");

    // Determine mode: predefined .wav voices vs clone references
    const isPredefined = voiceRef.endsWith(".wav") && !voiceRef.startsWith("voice_preview_");
    const voiceMode = isPredefined ? "predefined" : "clone";

    const audioBuffer = await generateSpeech({
      text: previewText,
      voiceRef,
      voiceMode,
      speed: 1.0,
    });

    return new NextResponse(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": audioBuffer.length.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err: any) {
    console.error("[Dia Preview]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
