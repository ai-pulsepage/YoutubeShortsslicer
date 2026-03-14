/**
 * POST /api/podcast/mix — Assemble all audio clips into a single podcast MP3
 *
 * Downloads individual WAV/MP3 clips from R2, concatenates them via FFmpeg
 * with short gaps between speakers, and uploads the final MP3 to R2.
 * Original clips are preserved — only a new combined file is created.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadBufferToR2, getR2PublicUrl, downloadFileFromR2 } from "@/lib/storage";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { episodeId } = await req.json();
  if (!episodeId) {
    return NextResponse.json({ error: "Episode ID required" }, { status: 400 });
  }

  const episode = await prisma.podcastEpisode.findUnique({
    where: { id: episodeId },
    include: { show: true },
  });

  if (!episode) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  const script = typeof episode.scriptJson === "string"
    ? JSON.parse(episode.scriptJson)
    : episode.scriptJson;

  const clips = script?.audioClips || [];
  const validClips = clips.filter((c: any) => c.url);

  if (validClips.length === 0) {
    return NextResponse.json({ error: "No audio clips to mix" }, { status: 400 });
  }

  console.log(`[Podcast Mix] Starting mix for "${episode.title}" — ${validClips.length} clips`);

  // Extract R2 key from public URL
  const r2PublicUrl = process.env.R2_PUBLIC_URL || "";
  function urlToR2Key(url: string): string | null {
    if (r2PublicUrl && url.startsWith(r2PublicUrl)) {
      return url.slice(r2PublicUrl.length + 1); // +1 for the /
    }
    // Fallback: try to extract from URL path after bucket name
    try {
      const u = new URL(url);
      // URL path like /bucketname/key or just /key
      return u.pathname.replace(/^\/[^/]+\//, "").replace(/^\//, "");
    } catch {
      return null;
    }
  }

  // Create temp directory for processing
  const tmpDir = path.join(os.tmpdir(), `podcast-mix-${episodeId}-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // Download all clips via S3 (direct R2 access, no public URL fetch)
    const clipFiles: string[] = [];
    let lastSpeaker = "";

    for (let i = 0; i < validClips.length; i++) {
      const clip = validClips[i];
      const ext = clip.url.includes(".wav") ? "wav" : "mp3";
      const filename = `clip-${String(i).padStart(4, "0")}.${ext}`;
      const filepath = path.join(tmpDir, filename);

      const r2Key = urlToR2Key(clip.url);
      if (!r2Key) {
        console.warn(`[Podcast Mix]   ✗ Could not extract R2 key from URL: ${clip.url}`);
        continue;
      }

      console.log(`[Podcast Mix]   Downloading clip ${i + 1}/${validClips.length}: ${clip.speaker} (${r2Key})`);

      try {
        await downloadFileFromR2(r2Key, filepath);
      } catch (err: any) {
        console.warn(`[Podcast Mix]   ✗ Failed to download clip ${i}: ${err.message}`);
        continue;
      }

      // Add a silence gap between different speakers (400ms) or same speaker (150ms)
      if (clipFiles.length > 0) {
        const gapMs = clip.speaker !== lastSpeaker ? 400 : 150;
        const silenceFile = path.join(tmpDir, `silence-${String(i).padStart(4, "0")}.wav`);
        execSync(
          `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t ${gapMs / 1000} "${silenceFile}"`,
          { stdio: "pipe" }
        );
        clipFiles.push(silenceFile);
      }

      clipFiles.push(filepath);
      lastSpeaker = clip.speaker;
    }

    if (clipFiles.length === 0) {
      return NextResponse.json({ error: "No clips could be downloaded" }, { status: 500 });
    }

    // Create FFmpeg concat list
    const listFile = path.join(tmpDir, "concat-list.txt");
    const listContent = clipFiles.map(f => `file '${f.replace(/\\/g, "/")}'`).join("\n");
    fs.writeFileSync(listFile, listContent);

    // Concatenate all clips into a single MP3
    const outputFile = path.join(tmpDir, "podcast-final.mp3");
    console.log(`[Podcast Mix] Concatenating ${clipFiles.length} files...`);

    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c:a libmp3lame -b:a 192k -ar 44100 -ac 1 "${outputFile}"`,
      { stdio: "pipe", timeout: 120000 }
    );

    // Get file size and duration
    const stats = fs.statSync(outputFile);
    let durationSeconds = 0;
    try {
      const probeOutput = execSync(
        `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${outputFile}"`,
        { encoding: "utf-8", timeout: 10000 }
      ).trim();
      durationSeconds = parseFloat(probeOutput) || 0;
    } catch { /* ignore probe errors */ }

    // Upload to R2
    const r2Key = `podcast-audio/${episodeId}/podcast-final.mp3`;
    const finalBuffer = fs.readFileSync(outputFile);
    await uploadBufferToR2(finalBuffer, r2Key, "audio/mpeg");
    const publicUrl = getR2PublicUrl(r2Key);

    console.log(`[Podcast Mix] ✓ Final podcast uploaded: ${(stats.size / 1024 / 1024).toFixed(1)}MB, ${Math.round(durationSeconds / 60)} min`);

    // Save the mix URL to scriptJson
    await prisma.podcastEpisode.update({
      where: { id: episodeId },
      data: {
        status: "ASSEMBLING",
        scriptJson: {
          ...script,
          mixedAudioUrl: publicUrl,
          mixedAt: new Date().toISOString(),
          mixedDurationSeconds: durationSeconds,
          mixedFileSizeMB: +(stats.size / 1024 / 1024).toFixed(1),
        },
      },
    });

    return NextResponse.json({
      success: true,
      url: publicUrl,
      durationSeconds,
      fileSizeMB: +(stats.size / 1024 / 1024).toFixed(1),
      clipsUsed: validClips.length,
    });
  } catch (err: any) {
    console.error(`[Podcast Mix] Error: ${err.message}`);
    return NextResponse.json({ error: `Mix failed: ${err.message}` }, { status: 500 });
  } finally {
    // Clean up temp files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* ignore cleanup errors */ }
  }
}
