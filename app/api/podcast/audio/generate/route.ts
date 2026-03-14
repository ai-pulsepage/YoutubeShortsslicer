import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateVoiceover, diaHealthCheck } from "@/lib/tts";
import type { TtsEngine } from "@/lib/tts";
import { uploadBufferToR2 as uploadBuffer, getR2PublicUrl } from "@/lib/storage";

// Dia predefined voices — actual names from the Dia-TTS-Server voice library
const DEFAULT_DIA_VOICES = [
  "Adrian.wav", "Eli.wav", "Michael.wav", "Alexander.wav",
  "Connor.wav", "Gabriel.wav", "Henry.wav", "Julian.wav",
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

  if (!episode.scriptJson) {
    return NextResponse.json({ error: "No script — generate a script first" }, { status: 400 });
  }

  const script = typeof episode.scriptJson === "string"
    ? JSON.parse(episode.scriptJson)
    : episode.scriptJson;

  // Build character voice maps
  const voiceMap: Record<string, string> = {};       // ElevenLabs voiceId map
  const diaVoiceMap: Record<string, string> = {};    // Dia voice reference filename map
  const voiceRefR2Map: Record<string, string> = {};  // Character name → R2 voiceRefPath (for R2→Dia sync)
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
      voiceRefR2Map[name] = p.character.voiceRefPath; // Track that this character has a voice ref
    } else {
      diaVoiceMap[name] = defaultDiaVoices[pi % defaultDiaVoices.length];
    }
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
  generateAudioInBackground(episodeId, script, allLines, voiceMap, diaVoiceMap, voiceRefR2Map, hostVoiceId, engine).catch(async (err) => {
    console.error(`[Podcast Audio] Fatal background error: ${err.message}`);
    try {
      await prisma.podcastEpisode.update({
        where: { id: episodeId },
        data: { status: "FAILED_PODCAST" },
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
  voiceRefR2Map: Record<string, string>,
  hostVoiceId: string,
  engine: TtsEngine,
) {
  const audioClips: { speaker: string; text: string; url: string; durationEstimate: number }[] = [];
  let successCount = 0;
  let failCount = 0;
  const audioFormat = engine === "dia" ? "wav" : "mp3";
  const mimeType = engine === "dia" ? "audio/wav" : "audio/mpeg";

  // No R2→Dia sync needed — voiceRefPath now stores the Dia server filename directly
  // (files are already on the Dia server, either as predefined voices or uploaded references)

  // Predefined voice filenames (from ./voices/ dir on Dia server)
  const PREDEFINED_VOICE_NAMES = new Set(DEFAULT_DIA_VOICES.map(v => v.toLowerCase()));

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const voiceId = voiceMap[line.speaker] || hostVoiceId;
    const diaVoiceRef = diaVoiceMap[line.speaker] || DEFAULT_DIA_VOICES[0];

    // Determine mode: if filename matches a predefined voice, use predefined; otherwise clone
    const isPredefined = PREDEFINED_VOICE_NAMES.has(diaVoiceRef.toLowerCase());
    const diaVoiceMode = isPredefined ? "predefined" : "clone";

    const logVoice = engine === "dia" ? `${diaVoiceRef} (${diaVoiceMode})` : `${voiceId.substring(0, 8)}...`;
    console.log(`[Podcast Audio]   ${i + 1}/${allLines.length}: ${line.speaker} (${engine}: ${logVoice})`);

    try {
      const audioBuffer = await generateVoiceover({
        text: line.text,
        engine,
        voiceId,
        narratorStyle: "conversational",
        diaVoiceRef: engine === "dia" ? diaVoiceRef : undefined,
        diaVoiceMode: engine === "dia" ? diaVoiceMode : undefined,
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

  // Final save with completed status
  await prisma.podcastEpisode.update({
    where: { id: episodeId },
    data: {
      status: successCount > 0 ? "ASSEMBLING" : "FAILED_PODCAST",
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
