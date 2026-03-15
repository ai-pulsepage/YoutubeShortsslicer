import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * GET /api/podcast/dia/voices
 *
 * Proxy endpoint that fetches available voices from the Dia-TTS-Server.
 * Returns both predefined voices and reference audio files.
 *
 * Query params:
 *   ?type=predefined  → list predefined voices (from /voices/ dir)
 *   ?type=reference    → list reference audio files (from /reference_audio/ dir)
 *   ?type=all          → both (default)
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const diaUrl = process.env.DIA_TTS_URL;
  if (!diaUrl) {
    // Return empty results with warning instead of 500 — UI should still load
    console.warn("[Dia Voices] DIA_TTS_URL not configured");
    return NextResponse.json({ predefined: [], reference: [], warning: "DIA_TTS_URL not configured" });
  }

  const endpoint = diaUrl.replace(/\/$/, "");
  const type = req.nextUrl.searchParams.get("type") || "all";

  try {
    const result: { predefined: any[]; reference: any[] } = { predefined: [], reference: [] };

    // Fetch predefined voices
    if (type === "predefined" || type === "all") {
      try {
        const res = await fetch(`${endpoint}/get_predefined_voices`, {
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const data = await res.json();
          // The endpoint may return a list of filenames or objects.
          // Normalize the response.
          if (Array.isArray(data)) {
            result.predefined = data.map((v: any) => {
              if (typeof v === "string") {
                const name = v.replace(/\.wav$/, "");
                return { filename: v, name, type: "predefined" };
              }
              return { ...v, type: "predefined" };
            });
          } else if (data.voices) {
            result.predefined = data.voices.map((v: any) => ({
              ...v,
              type: "predefined",
            }));
          }
        }
      } catch (err: any) {
        console.warn(`[Dia Voices] Failed to fetch predefined voices: ${err.message}`);
      }

      // Fallback: if server is unreachable, provide known predefined voices
      if (result.predefined.length === 0) {
        console.log(`[Dia Voices] Server fetch returned 0 predefined voices — using hardcoded fallback`);
        const KNOWN_PREDEFINED = [
          "Abigail", "Abigail_Taylor", "Adrian", "Adrian_Jade",
          "Alexander", "Alexander_Emily", "Alice", "Austin",
          "Austin_Jeremiah", "Axel", "Axel_Miles", "Connor",
          "Connor_Ryan", "Cora", "Cora_Gianna", "Elena",
          "Elena_Emily", "Eli", "Emily", "Everett",
          "Everett_Jordan", "Gabriel", "Gabriel_Ian", "Gianna",
          "Henry", "Ian", "Jade", "Jade_Layla",
          "Jeremiah", "Jordan", "Julian", "Julian_Thomas",
          "Layla", "Leonardo", "Leonardo_Olivia", "Michael",
          "Michael_Emily", "Miles", "Oliver_Luna", "Olivia",
          "Ryan", "Taylor", "Thomas",
        ];
        result.predefined = KNOWN_PREDEFINED.map((name) => ({
          filename: `${name}.wav`,
          name,
          type: "predefined",
        }));
        console.log(`[Dia Voices] Using ${KNOWN_PREDEFINED.length} hardcoded fallback voices`);
      } else {
        console.log(`[Dia Voices] Got ${result.predefined.length} predefined voices from server`);
      }
    }

    // Fetch reference audio files
    if (type === "reference" || type === "all") {
      try {
        const res = await fetch(`${endpoint}/get_reference_files`, {
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            result.reference = data.map((v: any) => {
              if (typeof v === "string") {
                const name = v.replace(/\.(wav|mp3)$/, "");
                return { filename: v, name, type: "reference" };
              }
              return { ...v, type: "reference" };
            });
          } else if (data.files) {
            result.reference = data.files.map((v: any) => ({
              ...v,
              type: "reference",
            }));
          }
        }
      } catch (err: any) {
        console.warn(`[Dia Voices] Failed to fetch reference files: ${err.message}`);
      }
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[Dia Voices]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/podcast/dia/voices
 *
 * Upload a reference audio file directly to the Dia-TTS-Server.
 * Accepts multipart form data with a 'file' field.
 * Also saves a backup copy to R2 for persistence.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const diaUrl = process.env.DIA_TTS_URL;
  if (!diaUrl) {
    return NextResponse.json({ error: "DIA_TTS_URL not configured — set it in your environment variables" }, { status: 500 });
  }

  const endpoint = diaUrl.replace(/\/$/, "");

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Forward the upload to Dia server (field name must be "files" per Dia API)
    const diaForm = new FormData();
    diaForm.append("files", file);

    let uploadRes: Response;
    try {
      uploadRes = await fetch(`${endpoint}/upload_reference`, {
        method: "POST",
        body: diaForm,
        signal: AbortSignal.timeout(30000),
      });
    } catch (fetchErr: any) {
      console.error(`[Dia Voices Upload] Cannot reach Dia server at ${endpoint}: ${fetchErr.message}`);
      return NextResponse.json({
        error: `Cannot reach Dia TTS Server at ${endpoint}. Is the RunPod pod running? Error: ${fetchErr.message}`,
      }, { status: 503 });
    }

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error(`[Dia Voices Upload] Server returned ${uploadRes.status}: ${errText}`);
      return NextResponse.json({
        error: `Dia server upload failed: ${uploadRes.status} — ${errText}`,
      }, { status: uploadRes.status >= 500 ? 502 : uploadRes.status });
    }

    const uploadData = await uploadRes.json().catch(() => ({}));

    // Also backup to R2 for persistence across pod restarts
    try {
      const { uploadBufferToR2 } = await import("@/lib/storage");
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const r2Key = `dia-reference-audio/${file.name}`;
      await uploadBufferToR2(buffer, r2Key, file.type || "audio/wav");
      console.log(`[Dia Voices] Backed up ${file.name} to R2: ${r2Key}`);

      // Transcribe the voice reference with OpenAI Whisper and cache the transcript
      // This allows Dia to skip its internal Whisper on every TTS call (~5-10s saved per clip)
      try {
        const openaiKey = process.env.OPENAI_API_KEY;
        if (openaiKey) {
          const whisperForm = new FormData();
          const blob = new Blob([buffer], { type: file.type || "audio/mpeg" });
          whisperForm.append("file", blob, file.name);
          whisperForm.append("model", "whisper-1");

          console.log(`[Dia Voices] Transcribing ${file.name} with OpenAI Whisper...`);
          const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${openaiKey}` },
            body: whisperForm,
          });

          if (whisperRes.ok) {
            const whisperData = await whisperRes.json();
            const transcript = whisperData.text?.trim();
            if (transcript) {
              // Save transcript to R2 alongside the audio
              const txtKey = `dia-reference-audio/${file.name}.txt`;
              await uploadBufferToR2(Buffer.from(transcript, "utf-8"), txtKey, "text/plain");
              console.log(`[Dia Voices] ✓ Transcript cached: "${transcript.substring(0, 80)}..." → ${txtKey}`);
            }
          } else {
            console.warn(`[Dia Voices] Whisper transcription failed: ${whisperRes.status}`);
          }
        } else {
          console.warn(`[Dia Voices] OPENAI_API_KEY not set — skipping transcript caching`);
        }
      } catch (transcribeErr: any) {
        console.warn(`[Dia Voices] Transcription failed (non-critical): ${transcribeErr.message}`);
      }
    } catch (err: any) {
      console.warn(`[Dia Voices] R2 backup failed (non-critical): ${err.message}`);
    }

    return NextResponse.json({
      success: true,
      filename: file.name,
      ...uploadData,
    });
  } catch (err: any) {
    console.error("[Dia Voices Upload]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
