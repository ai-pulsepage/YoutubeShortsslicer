import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { exec } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * POST /api/podcast/audio/download — Concatenate all clips into one full episode file
 *
 * Body: { episodeId: string }
 * Returns: audio/wav binary (full episode)
 *
 * How it works:
 * 1. Loads all audio clips from the episode's scriptJson
 * 2. Downloads each clip from R2
 * 3. Generates silence WAV files for gaps between clips
 * 4. Uses ffmpeg to concatenate everything into one file
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

  const episode = await prisma.podcastEpisode.findUnique({
    where: { id: episodeId },
    include: { show: { select: { userId: true, name: true } } },
  });

  if (!episode || episode.show.userId !== session.user.id) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  const script = episode.scriptJson as any;
  const audioClips = script?.audioClips || [];
  const clipsWithAudio = audioClips.filter((c: any) => c.url);

  if (clipsWithAudio.length === 0) {
    return NextResponse.json({ error: "No audio clips to download" }, { status: 400 });
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "podcast-mixdown-"));

  try {
    console.log(`[Podcast Download] Starting mixdown for "${episode.title}" — ${clipsWithAudio.length} clips`);

    // ─── Step 1: Download all clips to temp files ───
    const fileParts: string[] = [];
    let fileIdx = 0;

    for (let i = 0; i < audioClips.length; i++) {
      const clip = audioClips[i];
      if (!clip.url) continue;

      // Download the clip audio
      const clipPath = path.join(tmpDir, `clip-${String(fileIdx).padStart(4, "0")}.wav`);
      const response = await fetch(clip.url);
      if (!response.ok) {
        console.warn(`[Podcast Download] Failed to download clip ${i}: ${response.status}`);
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(clipPath, buffer);
      fileParts.push(clipPath);

      // Add silence gap after this clip (if not the last one)
      const silenceDuration = clip.silenceAfter ?? 0.4;
      if (silenceDuration > 0 && i < audioClips.length - 1) {
        const silencePath = path.join(tmpDir, `silence-${String(fileIdx).padStart(4, "0")}.wav`);
        // Generate silence WAV using ffmpeg
        await execAsync(
          `ffmpeg -y -f lavfi -i anullsrc=channel_layout=mono:sample_rate=44100 -t ${silenceDuration} "${silencePath}"`,
          { timeout: 10000 }
        );
        fileParts.push(silencePath);
      }
      fileIdx++;
    }

    if (fileParts.length === 0) {
      return NextResponse.json({ error: "Failed to download any audio clips" }, { status: 500 });
    }

    // ─── Step 2: Create ffmpeg concat list ───
    const concatListPath = path.join(tmpDir, "concat.txt");
    const concatContent = fileParts.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join("\n");
    await fs.writeFile(concatListPath, concatContent);

    // ─── Step 3: Concatenate with ffmpeg ───
    const outputPath = path.join(tmpDir, "full-episode.wav");
    console.log(`[Podcast Download] Concatenating ${fileParts.length} parts...`);

    await execAsync(
      `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${outputPath}"`,
      { timeout: 120000 } // 2 min timeout for large episodes
    );

    // ─── Step 4: Read and return the file ───
    const outputBuffer = await fs.readFile(outputPath);
    const safeTitle = (episode.title || "episode").replace(/[^a-z0-9]/gi, "_").substring(0, 50);

    console.log(`[Podcast Download] Done! ${(outputBuffer.length / 1024 / 1024).toFixed(1)}MB`);

    return new NextResponse(new Uint8Array(outputBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": outputBuffer.length.toString(),
        "Content-Disposition": `attachment; filename="${safeTitle}.wav"`,
      },
    });
  } catch (err: any) {
    console.error(`[Podcast Download] Error: ${err.message}`);
    return NextResponse.json({ error: `Mixdown failed: ${err.message}` }, { status: 500 });
  } finally {
    // Clean up temp files
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch { /* ignore cleanup errors */ }
  }
}
