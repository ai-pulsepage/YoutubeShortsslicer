import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateVoiceover } from "@/lib/tts";
import { uploadBufferToR2 as uploadBuffer } from "@/lib/storage";

/**
 * POST /api/podcast/audio/generate
 *
 * Generates TTS audio for each dialogue line in a podcast episode script.
 * Uses ElevenLabs with each character's assigned voiceId.
 * Stores audio clips to R2 and updates the episode.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { episodeId } = await req.json();
  if (!episodeId) {
    return NextResponse.json({ error: "episodeId required" }, { status: 400 });
  }

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

  // Build character voiceId map
  const voiceMap: Record<string, string> = {};
  const defaultVoice = "21m00Tcm4TlvDq8ikWAM"; // Rachel (ElevenLabs default)
  for (const p of episode.participants) {
    const name = p.character.name;
    voiceMap[name] = p.character.voiceId || defaultVoice;
  }

  // Update status to RECORDING
  await prisma.podcastEpisode.update({
    where: { id: episodeId },
    data: { status: "RECORDING" },
  });

  try {
    // Collect all dialogue lines across segments
    const allLines: { speaker: string; text: string; segIdx: number; lineIdx: number }[] = [];
    const segments = script.segments || [];

    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      const lines = seg.lines || [];
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        const speaker = line.speaker || line.characterName || "Unknown";
        const text = line.text || line.dialogue || "";
        if (text.trim()) {
          allLines.push({ speaker, text, segIdx: si, lineIdx: li });
        }
      }
    }

    if (allLines.length === 0) {
      return NextResponse.json({ error: "No dialogue lines found in script" }, { status: 400 });
    }

    console.log(`[Podcast Audio] Generating ${allLines.length} voice clips for "${episode.title}"`);

    // Generate TTS for each line
    const audioClips: { speaker: string; text: string; url: string; durationEstimate: number }[] = [];

    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i];
      const voiceId = voiceMap[line.speaker] || defaultVoice;

      console.log(`[Podcast Audio]   ${i + 1}/${allLines.length}: ${line.speaker} (voice: ${voiceId.substring(0, 8)}...)`);

      try {
        const audioBuffer = await generateVoiceover({
          text: line.text,
          engine: "elevenlabs",
          voiceId,
          narratorStyle: "conversational",
        });

        // Upload to R2
        const key = `podcast-audio/${episodeId}/line-${String(i).padStart(4, "0")}.mp3`;
        const url = await uploadBuffer(audioBuffer, key, "audio/mpeg");

        // Rough duration estimate: ~150 words per minute
        const wordCount = line.text.split(/\s+/).length;
        const durationEstimate = (wordCount / 150) * 60;

        audioClips.push({
          speaker: line.speaker,
          text: line.text,
          url,
          durationEstimate,
        });
      } catch (err: any) {
        console.error(`[Podcast Audio]   FAILED line ${i}: ${err.message}`);
        // Continue with other lines — don't fail the whole batch
        audioClips.push({
          speaker: line.speaker,
          text: line.text,
          url: "",
          durationEstimate: 0,
        });
      }
    }

    const successCount = audioClips.filter(c => c.url).length;
    const totalDuration = audioClips.reduce((sum, c) => sum + c.durationEstimate, 0);

    console.log(`[Podcast Audio] Done! ${successCount}/${allLines.length} clips generated, ~${Math.round(totalDuration)}s total`);

    // Save audio data to the episode
    await prisma.podcastEpisode.update({
      where: { id: episodeId },
      data: {
        status: successCount === allLines.length ? "ASSEMBLING" : "RECORDING",
        scriptJson: {
          ...script,
          audioClips,
          audioGeneratedAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({
      success: true,
      clips: audioClips.length,
      successCount,
      failedCount: allLines.length - successCount,
      totalDurationSeconds: Math.round(totalDuration),
    });
  } catch (err: any) {
    console.error(`[Podcast Audio] Fatal error: ${err.message}`);
    await prisma.podcastEpisode.update({
      where: { id: episodeId },
      data: { status: "FAILED_PODCAST" },
    });
    return NextResponse.json(
      { error: `Audio generation failed: ${err.message}` },
      { status: 500 }
    );
  }
}
