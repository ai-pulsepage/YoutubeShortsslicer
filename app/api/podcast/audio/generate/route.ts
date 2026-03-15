import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateVoiceover, diaHealthCheck } from "@/lib/tts";
import type { TtsEngine } from "@/lib/tts";
import { uploadBufferToR2 as uploadBuffer, getR2PublicUrl } from "@/lib/storage";

// Dia predefined voices — actual names from the Dia-TTS-Server voice library
const DEFAULT_DIA_VOICES = [
  "Abigail.wav", "Abigail_Taylor.wav", "Adrian.wav", "Adrian_Jade.wav",
  "Alexander.wav", "Alexander_Emily.wav", "Alice.wav", "Austin.wav",
  "Austin_Jeremiah.wav", "Axel.wav", "Axel_Miles.wav", "Connor.wav",
  "Connor_Ryan.wav", "Cora.wav", "Cora_Gianna.wav", "Elena.wav",
  "Elena_Emily.wav", "Eli.wav", "Emily.wav", "Everett.wav",
  "Everett_Jordan.wav", "Gabriel.wav", "Gabriel_Ian.wav", "Gianna.wav",
  "Henry.wav", "Ian.wav", "Jade.wav", "Jade_Layla.wav",
  "Jeremiah.wav", "Jordan.wav", "Julian.wav", "Julian_Thomas.wav",
  "Layla.wav", "Leonardo.wav", "Leonardo_Olivia.wav", "Michael.wav",
  "Michael_Emily.wav", "Miles.wav", "Oliver_Luna.wav", "Olivia.wav",
  "Ryan.wav", "Taylor.wav", "Thomas.wav",
];

/**
 * POST /api/podcast/audio/generate
 *
 * Generates TTS audio for each dialogue line in a podcast episode script.
 * Uses ElevenLabs with each character's assigned voiceId.
 * Stores audio clips to R2 and updates the episode incrementally.
 *
 * Fire-and-forget: returns immediately, generates audio in background.
 * Saves progress after every clip so nothing is lost on failure.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { episodeId, engine: requestedEngine } = await req.json();
  if (!episodeId) {
    return NextResponse.json({ error: "episodeId required" }, { status: 400 });
  }

  const engine: TtsEngine = requestedEngine === "dia" ? "dia" : "elevenlabs";

  // Load episode with script, participants, and show
  const episode = await prisma.podcastEpisode.findUnique({
    where: { id: episodeId },
    include: {
      show: { select: { userId: true, name: true } },
      participants: { include: { character: true } },
    },
  });

  if (!episode || episode.show.userId !== session.user.id) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  // ─── Status Gate ─────────────────────────────────────
  const ALLOWED_AUDIO_STATUSES = new Set(["READY", "FAILED_AUDIO"]);
  // Also allow FAILED_PODCAST if a script exists (was actually an audio failure from before FAILED_AUDIO existed)
  const canGenerate = ALLOWED_AUDIO_STATUSES.has(episode.status) ||
    (episode.status === "FAILED_PODCAST" && episode.scriptJson);

  if (!canGenerate) {
    return NextResponse.json({
      error: `Cannot generate audio while episode is ${episode.status}. ${
        episode.status === "SCRIPTING" ? "Script is still generating — wait for it to finish." :
        episode.status === "RECORDING" ? "Audio generation is already in progress." :
        episode.status === "DRAFT" ? "Generate a script first." :
        "Go back to the audio step first."
      }`,
    }, { status: 409 });
  }

  if (!episode.scriptJson) {
    return NextResponse.json({ error: "No script — generate a script first" }, { status: 400 });
  }

  const script = typeof episode.scriptJson === "string"
    ? JSON.parse(episode.scriptJson)
    : episode.scriptJson;

  // Build character voice maps
  const voiceMap: Record<string, string> = {};       // ElevenLabs voiceId map
  const diaVoiceMap: Record<string, string> = {};    // Dia voice reference filename map
  const speechRateMap: Record<string, number> = {};  // Per-character speech rate
  let transcriptMap: Record<string, string> = {};    // Pre-computed transcripts for clone voices
  const hostParticipant = episode.participants.find((p: any) => p.character.role === "HOST") || episode.participants[0];
  const hostVoiceId = hostParticipant?.character?.voiceId || "";

  // Default Dia predefined voices — actual names from the Dia-TTS-Server voice library
  const defaultDiaVoices = DEFAULT_DIA_VOICES;

  for (let pi = 0; pi < episode.participants.length; pi++) {
    const p = episode.participants[pi] as any;
    const name = p.character.name;
    voiceMap[name] = p.character.voiceId || hostVoiceId;

    // Dia voice: voiceRefPath now stores the Dia server filename directly
    // (e.g., "Adrian.wav" for predefined or "voice_preview_hank.mp3" for clone reference)
    if (p.character.voiceRefPath) {
      diaVoiceMap[name] = p.character.voiceRefPath;
    } else {
      diaVoiceMap[name] = defaultDiaVoices[pi % defaultDiaVoices.length];
    }
    // Store character speech rate
    speechRateMap[name] = p.character.speechRate || 1.0;
  }
  if (hostVoiceId) {
    voiceMap["Unknown"] = hostVoiceId;
  }
  diaVoiceMap["Unknown"] = diaVoiceMap[hostParticipant?.character?.name] || defaultDiaVoices[0];

  // Validate voices based on engine
  if (engine === "elevenlabs") {
    const missingVoices = episode.participants.filter((p: any) => !p.character.voiceId);
    if (missingVoices.length > 0) {
      const names = missingVoices.map((p: any) => p.character.name).join(", ");
      console.warn(`[Podcast Audio] Characters without voices (will use host fallback): ${names}`);
    }
    if (!hostVoiceId) {
      return NextResponse.json({ error: "No voice IDs assigned to any characters. Assign ElevenLabs voices first." }, { status: 400 });
    }
  } else if (engine === "dia") {
    // Check Dia server is reachable
    const health = await diaHealthCheck();
    if (!health.healthy) {
      return NextResponse.json({ error: `Dia TTS Server not available: ${health.message}` }, { status: 503 });
    }
    console.log(`[Podcast Audio] Dia TTS Server healthy — using Dia engine`);

    // Auto-restore voice references from R2 to Dia server
    // (Dia pods are ephemeral — reference_audio/ is wiped on restart)
    const diaEndpoint = (process.env.DIA_TTS_URL || "").replace(/\/$/, "");
    await syncVoiceRefsTodia(diaVoiceMap, diaEndpoint);

    // Load pre-computed transcripts from R2 for clone voices
    // This allows Dia to skip Whisper transcription on each clip (~5-10s saved per clip)
    transcriptMap = await loadVoiceTranscripts(diaVoiceMap);
  }

  // Update status to RECORDING
  await prisma.podcastEpisode.update({
    where: { id: episodeId },
    data: { status: "RECORDING" },
  });

  // Collect all dialogue lines
  const allLines: { speaker: string; text: string; segIdx: number; lineIdx: number }[] = [];
  const segments = script.segments || [];

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    const lines = seg.lines || [];
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      let speaker = line.speaker || line.characterName || "Unknown";
      if (speaker === "Unknown" && hostParticipant) {
        speaker = hostParticipant.character.name;
      }
      const text = line.text || line.dialogue || "";
      if (text.trim()) {
        allLines.push({ speaker, text, segIdx: si, lineIdx: li });
      }
    }
  }

  if (allLines.length === 0) {
    return NextResponse.json({ error: "No dialogue lines found in script" }, { status: 400 });
  }

  console.log(`[Podcast Audio] Generating ${allLines.length} voice clips for "${episode.title}" via ${engine}`);

  // ─── Fire-and-forget: generate in background ────────────
  generateAudioInBackground(episodeId, script, allLines, voiceMap, diaVoiceMap, hostVoiceId, engine, transcriptMap, speechRateMap).catch(async (err) => {
    console.error(`[Podcast Audio] Fatal background error: ${err.message}`);
    try {
      await prisma.podcastEpisode.update({
        where: { id: episodeId },
        data: { status: "FAILED_AUDIO" },
      });
    } catch (dbErr) {
      console.error(`[Podcast Audio] Failed to mark episode as failed`, dbErr);
    }
  });

  return NextResponse.json({
    success: true,
    dispatched: true,
    engine,
    totalLines: allLines.length,
    message: `Audio generation started for ${allLines.length} dialogue lines via ${engine}`,
  });
}

/**
 * Background audio generation with incremental saves.
 * After each successful clip, saves progress to DB so nothing is lost.
 */
async function generateAudioInBackground(
  episodeId: string,
  script: any,
  allLines: { speaker: string; text: string; segIdx: number; lineIdx: number }[],
  voiceMap: Record<string, string>,
  diaVoiceMap: Record<string, string>,
  hostVoiceId: string,
  engine: TtsEngine,
  transcriptMap: Record<string, string> = {},
  speechRateMap: Record<string, number> = {},
) {
  const audioFormat = engine === "dia" ? "wav" : "mp3";
  const mimeType = engine === "dia" ? "audio/wav" : "audio/mpeg";

  // ─── Smart retry: load existing clips from previous run ────
  const existingClips: { speaker: string; text: string; url: string; durationEstimate: number }[] = script.audioClips || [];
  const audioClips: { speaker: string; text: string; url: string; durationEstimate: number }[] = [];
  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;

  // Helper: check if user cancelled (reset to DRAFT/READY) during generation
  const wasAborted = async (): Promise<boolean> => {
    try {
      const current = await prisma.podcastEpisode.findUnique({
        where: { id: episodeId },
        select: { status: true },
      });
      // If status changed away from RECORDING, user cancelled
      if (current && current.status !== "RECORDING") {
        console.log(`[Podcast Audio] Detected status change to ${current.status} — aborting background write`);
        return true;
      }
    } catch { /* ignore check errors */ }
    return false;
  };

  // Predefined voice filenames (from ./voices/ dir on Dia server)
  const PREDEFINED_VOICE_NAMES = new Set(DEFAULT_DIA_VOICES.map(v => v.toLowerCase()));

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const voiceId = voiceMap[line.speaker] || hostVoiceId;
    const diaVoiceRef = diaVoiceMap[line.speaker] || DEFAULT_DIA_VOICES[0];

    // ─── Smart retry: skip clips that already have URLs ────
    const existingClip = existingClips[i];
    if (existingClip && existingClip.url) {
      // Already generated successfully in a previous run — keep it
      audioClips.push(existingClip);
      successCount++;
      skippedCount++;
      if (skippedCount <= 3 || skippedCount % 20 === 0) {
        console.log(`[Podcast Audio]   ${i + 1}/${allLines.length}: SKIP (already has audio)`);
      }

      // Still save progress at checkpoints so UI polling stays current
      if ((i + 1) % 10 === 0) {
        try {
          await prisma.podcastEpisode.update({
            where: { id: episodeId },
            data: {
              scriptJson: {
                ...script,
                audioClips,
                audioGeneratedAt: new Date().toISOString(),
                audioProgress: `${i + 1}/${allLines.length}`,
              },
            },
          });
        } catch { /* ignore save errors during skip */ }
      }

      continue;
    }

    // Determine mode: if filename matches a predefined voice, use predefined; otherwise clone
    const isPredefined = PREDEFINED_VOICE_NAMES.has(diaVoiceRef.toLowerCase());
    let diaVoiceMode: "dialogue" | "single_s1" | "single_s2" | "clone" | "predefined" = isPredefined ? "predefined" : "clone";
    let currentVoiceRef = diaVoiceRef;

    const logVoice = engine === "dia" ? `${currentVoiceRef} (${diaVoiceMode})` : `${voiceId.substring(0, 8)}...`;
    console.log(`[Podcast Audio]   ${i + 1}/${allLines.length}: ${line.speaker} (${engine}: ${logVoice})`);

    try {
      const charSpeed = speechRateMap[line.speaker] || 1.0;
      const audioBuffer = await generateVoiceover({
        text: line.text,
        engine,
        voiceId,
        speed: charSpeed,
        narratorStyle: "conversational",
        diaVoiceRef: engine === "dia" ? currentVoiceRef : undefined,
        diaVoiceMode: engine === "dia" ? diaVoiceMode : undefined,
        diaTranscript: engine === "dia" && diaVoiceMode === "clone" ? transcriptMap[currentVoiceRef] : undefined,
      });

      // Upload to R2
      const key = `podcast-audio/${episodeId}/line-${String(i).padStart(4, "0")}.${audioFormat}`;
      await uploadBuffer(audioBuffer, key, mimeType);

      // Convert R2 key to public URL
      const publicUrl = getR2PublicUrl(key);

      // Rough duration estimate: ~150 words per minute
      const wordCount = line.text.split(/\s+/).length;
      const durationEstimate = (wordCount / 150) * 60;

      audioClips.push({
        speaker: line.speaker,
        text: line.text,
        url: publicUrl,
        durationEstimate,
      });

      successCount++;
    } catch (err: any) {
      // ─── Fallback: on clone/whisper failure, retry with predefined voice ────
      if (engine === "dia" && diaVoiceMode === "clone" && err.message?.includes("400")) {
        const fallbackVoice = DEFAULT_DIA_VOICES[i % DEFAULT_DIA_VOICES.length];
        console.warn(`[Podcast Audio]   Clone failed for line ${i} — retrying with built-in voice (single_s1)`);
        try {
          const audioBuffer = await generateVoiceover({
            text: line.text,
            engine,
            voiceId,
            narratorStyle: "conversational",
            diaVoiceRef: undefined,
            diaVoiceMode: "single_s1",
          });

          const key = `podcast-audio/${episodeId}/line-${String(i).padStart(4, "0")}.${audioFormat}`;
          await uploadBuffer(audioBuffer, key, mimeType);
          const publicUrl = getR2PublicUrl(key);
          const wordCount = line.text.split(/\s+/).length;
          const durationEstimate = (wordCount / 150) * 60;

          audioClips.push({
            speaker: line.speaker,
            text: line.text,
            url: publicUrl,
            durationEstimate,
          });
          successCount++;
          console.log(`[Podcast Audio]   FALLBACK succeeded for line ${i} with ${fallbackVoice}`);
          continue;
        } catch (fallbackErr: any) {
          console.error(`[Podcast Audio]   FALLBACK also failed for line ${i}: ${fallbackErr.message}`);
        }
      }

      console.error(`[Podcast Audio]   FAILED line ${i}: ${err.message}`);
      failCount++;
      // Push empty clip so indexing stays correct
      audioClips.push({
        speaker: line.speaker,
        text: line.text,
        url: "",
        durationEstimate: 0,
      });

      // If we get 5+ consecutive failures, something is wrong — abort early
      const recentClips = audioClips.slice(-5);
      if (recentClips.length >= 5 && recentClips.every(c => !c.url)) {
        console.error(`[Podcast Audio]   5 consecutive failures — aborting`);
        break;
      }
    }

    // ─── Incremental save every 10 clips ────────────
    // So if the process crashes, we don't lose everything
    if ((i + 1) % 10 === 0 || i === allLines.length - 1) {
      try {
        await prisma.podcastEpisode.update({
          where: { id: episodeId },
          data: {
            scriptJson: {
              ...script,
              audioClips,
              audioGeneratedAt: new Date().toISOString(),
              audioProgress: `${i + 1}/${allLines.length}`,
            },
          },
        });
        console.log(`[Podcast Audio]   Progress saved: ${i + 1}/${allLines.length} (${successCount} ok, ${failCount} failed)`);
      } catch (saveErr: any) {
        console.error(`[Podcast Audio]   Progress save failed: ${saveErr.message}`);
      }
    }
  }

  const totalDuration = audioClips.reduce((sum, c) => sum + c.durationEstimate, 0);
  console.log(`[Podcast Audio] Done! ${successCount}/${allLines.length} clips generated, ~${Math.round(totalDuration)}s total`);

  // ─── Abort check: if user reset during generation, don't overwrite ───
  if (await wasAborted()) {
    console.log(`[Podcast Audio] Skipping final write — episode was reset during generation`);
    return;
  }

  // Final save with completed status
  await prisma.podcastEpisode.update({
    where: { id: episodeId },
    data: {
      status: successCount > 0 ? "ASSEMBLING" : "FAILED_AUDIO",
      scriptJson: {
        ...script,
        audioClips,
        audioGeneratedAt: new Date().toISOString(),
        audioProgress: "complete",
        audioStats: {
          total: allLines.length,
          success: successCount,
          failed: failCount,
          totalDurationSeconds: Math.round(totalDuration),
        },
      },
    },
  });
}

// ─── Auto-sync voice refs from R2 to Dia server ───────────────

/**
 * Syncs voice reference files from R2 to the Dia TTS server.
 * On each RunPod restart, the Dia server's ./reference_audio/ directory is empty.
 * This function checks which clone voice refs are needed, and if they're missing
 * from the Dia server, downloads them from R2 and re-uploads.
 */
async function syncVoiceRefsTodia(
  diaVoiceMap: Record<string, string>,
  diaEndpoint: string,
) {
  if (!diaEndpoint) return;

  // Collect unique clone voice refs (not predefined .wav voices baked into the server)
  const PREDEFINED_VOICES = new Set(DEFAULT_DIA_VOICES.map(v => v.toLowerCase()));
  const neededRefs = new Set<string>();
  for (const [, voiceRef] of Object.entries(diaVoiceMap)) {
    if (voiceRef && !PREDEFINED_VOICES.has(voiceRef.toLowerCase())) {
      neededRefs.add(voiceRef);
    }
  }

  if (neededRefs.size === 0) {
    console.log(`[Podcast Audio] All voices are predefined — no R2 sync needed`);
    return;
  }

  // Fetch list of existing reference files on the Dia server
  let existingFiles: string[] = [];
  try {
    const res = await fetch(`${diaEndpoint}/get_reference_files`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      existingFiles = Array.isArray(data) ? data : (data.files || []);
    }
  } catch (err: any) {
    console.warn(`[Podcast Audio] Could not list Dia reference files: ${err.message}`);
  }

  const existingSet = new Set(existingFiles.map((f: string) => f.toLowerCase()));

  // Check which refs are missing
  const missing: string[] = [];
  for (const ref of neededRefs) {
    if (!existingSet.has(ref.toLowerCase())) {
      missing.push(ref);
    }
  }

  if (missing.length === 0) {
    console.log(`[Podcast Audio] All ${neededRefs.size} clone voice refs already on Dia server`);
    return;
  }

  console.log(`[Podcast Audio] Syncing ${missing.length} voice ref(s) from R2 to Dia: ${missing.join(", ")}`);

  for (const filename of missing) {
    try {
      // Download from R2 backup
      const r2Key = `dia-reference-audio/${filename}`;
      const r2Url = getR2PublicUrl(r2Key);

      console.log(`[Podcast Audio]   Downloading ${filename} from R2...`);
      const r2Res = await fetch(r2Url, { signal: AbortSignal.timeout(15000) });
      if (!r2Res.ok) {
        console.warn(`[Podcast Audio]   R2 download failed for ${filename}: ${r2Res.status} — voice cloning will use fallback`);
        continue;
      }

      const audioBuffer = await r2Res.arrayBuffer();

      // Upload to Dia server
      console.log(`[Podcast Audio]   Uploading ${filename} to Dia server (${(audioBuffer.byteLength / 1024).toFixed(0)}KB)...`);
      const form = new FormData();
      const mimeType = filename.endsWith(".mp3") ? "audio/mpeg" : "audio/wav";
      form.append("files", new Blob([audioBuffer], { type: mimeType }), filename);

      const uploadRes = await fetch(`${diaEndpoint}/upload_reference`, {
        method: "POST",
        body: form,
      });

      if (uploadRes.ok) {
        console.log(`[Podcast Audio]   ✓ ${filename} synced to Dia server`);
      } else {
        const errText = await uploadRes.text();
        console.warn(`[Podcast Audio]   ✗ Upload failed for ${filename}: ${uploadRes.status} — ${errText}`);
      }
    } catch (err: any) {
      console.warn(`[Podcast Audio]   ✗ Sync failed for ${filename}: ${err.message}`);
    }
  }
}

// ─── Load pre-computed transcripts from R2 ─────────────────

/**
 * Loads pre-computed Whisper transcripts from R2 for clone voice references.
 * For each clone voice (e.g., "voice_preview_hank.mp3"), looks for a matching
 * .txt file at "dia-reference-audio/voice_preview_hank.mp3.txt" in R2.
 * Returns a map of voice filename → transcript text.
 */
async function loadVoiceTranscripts(
  diaVoiceMap: Record<string, string>,
): Promise<Record<string, string>> {
  const PREDEFINED_VOICES = new Set(DEFAULT_DIA_VOICES.map(v => v.toLowerCase()));
  const transcripts: Record<string, string> = {};
  const seen = new Set<string>();

  for (const [, voiceRef] of Object.entries(diaVoiceMap)) {
    if (!voiceRef || PREDEFINED_VOICES.has(voiceRef.toLowerCase()) || seen.has(voiceRef)) continue;
    seen.add(voiceRef);

    try {
      const txtKey = `dia-reference-audio/${voiceRef}.txt`;
      const txtUrl = getR2PublicUrl(txtKey);
      const res = await fetch(txtUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const text = await res.text();
        if (text.trim()) {
          transcripts[voiceRef] = text.trim();
          console.log(`[Podcast Audio] Loaded transcript for ${voiceRef} (${text.trim().length} chars)`);
          continue;
        }
      }
    } catch {
      // Fall through to backfill
    }

    // ─── Backfill: no transcript cached yet — transcribe now via OpenAI Whisper ────
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) continue;

    try {
      // Download the audio from R2
      const audioUrl = getR2PublicUrl(`dia-reference-audio/${voiceRef}`);
      const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(15000) });
      if (!audioRes.ok) continue;

      const audioBuffer = await audioRes.arrayBuffer();
      console.log(`[Podcast Audio] Backfilling transcript for ${voiceRef} via OpenAI Whisper...`);

      // Transcribe with OpenAI Whisper
      const whisperForm = new FormData();
      const mimeType = voiceRef.endsWith(".mp3") ? "audio/mpeg" : "audio/wav";
      whisperForm.append("file", new Blob([audioBuffer], { type: mimeType }), voiceRef);
      whisperForm.append("model", "whisper-1");

      const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: whisperForm,
      });

      if (whisperRes.ok) {
        const whisperData = await whisperRes.json();
        const transcript = whisperData.text?.trim();
        if (transcript) {
          transcripts[voiceRef] = transcript;

          // Save to R2 for future use
          const { uploadBufferToR2 } = await import("@/lib/storage");
          const txtKey = `dia-reference-audio/${voiceRef}.txt`;
          await uploadBufferToR2(Buffer.from(transcript, "utf-8"), txtKey, "text/plain");
          console.log(`[Podcast Audio] ✓ Backfilled transcript for ${voiceRef}: "${transcript.substring(0, 60)}..."`);
        }
      } else {
        console.warn(`[Podcast Audio] Whisper API returned ${whisperRes.status} for ${voiceRef}`);
      }
    } catch (err: any) {
      console.warn(`[Podcast Audio] Backfill transcription failed for ${voiceRef}: ${err.message}`);
    }
  }

  const count = Object.keys(transcripts).length;
  if (count > 0) {
    console.log(`[Podcast Audio] ${count} voice transcript(s) loaded — Whisper will be skipped for these`);
  } else {
    console.log(`[Podcast Audio] No cached transcripts found — Dia will use Whisper (slower)`);
  }

  return transcripts;
}
