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
    return NextResponse.json({ error: "DIA_TTS_URL not configured" }, { status: 500 });
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
    return NextResponse.json({ error: "DIA_TTS_URL not configured" }, { status: 500 });
  }

  const endpoint = diaUrl.replace(/\/$/, "");

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Forward the upload to Dia server
    const diaForm = new FormData();
    diaForm.append("file", file);

    const uploadRes = await fetch(`${endpoint}/upload_reference`, {
      method: "POST",
      body: diaForm,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return NextResponse.json({
        error: `Dia server upload failed: ${uploadRes.status} — ${errText}`,
      }, { status: 500 });
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
