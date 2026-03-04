/**
 * Render Worker — FFmpeg pipeline
 *
 * Processes rendered short videos:
 * 1. Downloads source video segment from R2
 * 2. Cuts segment (start → end)
 * 3. Burns subtitles if available
 * 4. Converts to 9:16 vertical if needed
 * 5. Mixes voiceover audio if enabled
 * 6. Uploads final short to R2
 *
 * Run: npx tsx workers/render.ts
 */
import { Worker, Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import IORedis from "ioredis";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { QUEUE_NAMES, RenderJobData } from "../lib/queue";
import { uploadFileToR2, generateShortR2Key } from "../lib/storage";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
});

const TEMP_DIR = path.join(os.tmpdir(), "yt-shorts-slicer", "render");
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

async function processRender(job: Job<RenderJobData>) {
    const { segmentId, userId, videoId } = job.data;

    try {
        console.log(`[Render] Starting: segment=${segmentId}`);
        await job.updateProgress(5);

        // Load segment + video + subtitle preset
        const segment = await prisma.segment.findUnique({
            where: { id: segmentId },
            include: {
                video: true,
                shortVideos: { take: 1, orderBy: { createdAt: "desc" } },
            },
        });

        if (!segment) throw new Error(`Segment ${segmentId} not found`);
        if (!segment.video.storagePath) throw new Error("Video has no storage path");

        const renderDir = path.join(TEMP_DIR, segmentId);
        if (!fs.existsSync(renderDir)) fs.mkdirSync(renderDir, { recursive: true });

        await job.updateProgress(10);

        // Step 1: Download source video from R2
        // (In production, download from R2. For dev, use local path)
        const sourceVideo = path.join(renderDir, "source.mp4");
        // TODO: Download from R2

        // Step 2: Cut segment
        const cutVideo = path.join(renderDir, "cut.mp4");
        const duration = segment.end - segment.start;

        execSync(
            `ffmpeg -ss ${segment.start} -i "${sourceVideo}" -t ${duration} -c copy -avoid_negative_ts 1 "${cutVideo}" -y`,
            { timeout: 300000 }
        );
        await job.updateProgress(30);

        // Step 3: Build subtitle filter if available
        let subtitleFilter = "";
        const preset = await prisma.subtitlePreset.findFirst({
            where: { userId },
            orderBy: { createdAt: "desc" },
        });

        if (preset) {
            // Build ASS subtitle filter from preset
            const fontName = preset.font || "Inter";
            const fontSize = preset.size || 24;
            const primaryColor = hexToAss(preset.color || "#FFFFFF");
            const outlineColor = hexToAss(preset.outline || "#000000");
            const shadowColor = hexToAss(preset.shadow || "#00000080");

            subtitleFilter = `drawtext=fontfile=/usr/share/fonts/truetype/${fontName}.ttf:fontsize=${fontSize}:fontcolor=${primaryColor}:borderw=2:bordercolor=${outlineColor}:shadowcolor=${shadowColor}:shadowx=2:shadowy=2`;
        }

        // Step 4: Convert to 9:16 vertical
        const outputPath = path.join(renderDir, "final.mp4");
        const filterChain = [
            "scale=1080:1920:force_original_aspect_ratio=decrease",
            "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
            "setsar=1",
        ];

        if (subtitleFilter) {
            filterChain.push(subtitleFilter);
        }

        execSync(
            `ffmpeg -i "${cutVideo}" -vf "${filterChain.join(",")}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart "${outputPath}" -y`,
            { timeout: 600000 }
        );
        await job.updateProgress(70);

        // Step 5: Mix voiceover if enabled
        if (segment.voiceoverEnabled) {
            const voiceoverPath = path.join(renderDir, "voiceover.wav");
            // TODO: Generate voiceover with Kokoro TTS and mix

            if (fs.existsSync(voiceoverPath)) {
                const mixedOutput = path.join(renderDir, "mixed.mp4");
                execSync(
                    `ffmpeg -i "${outputPath}" -i "${voiceoverPath}" -filter_complex "[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac "${mixedOutput}" -y`,
                    { timeout: 300000 }
                );
                fs.renameSync(mixedOutput, outputPath);
            }
        }
        await job.updateProgress(85);

        // Step 6: Upload to R2
        const r2Key = generateShortR2Key(userId, videoId, segmentId);
        await uploadFileToR2(outputPath, r2Key, "video/mp4");
        await job.updateProgress(95);

        // Step 7: Create/update ShortVideo record
        await prisma.shortVideo.create({
            data: {
                segmentId,
                storagePath: r2Key,
                duration: Math.round(duration),
                status: "RENDERED",
            },
        });

        await prisma.segment.update({
            where: { id: segmentId },
            data: { status: "RENDERED" },
        });

        // Cleanup
        fs.rmSync(renderDir, { recursive: true, force: true });

        console.log(`[Render] Complete: ${segmentId} → ${r2Key}`);
        await job.updateProgress(100);

        return { segmentId, r2Key, duration };
    } catch (error: any) {
        console.error(`[Render] Failed: ${segmentId}`, error.message);
        throw error;
    }
}

function hexToAss(hex: string): string {
    // Convert #RRGGBB to ASS format (without alpha for drawtext)
    return hex.replace("#", "0x");
}

// ─── Start Worker ────────────────────────────────
const worker = new Worker<RenderJobData>(
    QUEUE_NAMES.RENDER,
    processRender,
    {
        connection: redis,
        concurrency: 2,
        limiter: { max: 5, duration: 60000 },
    }
);

worker.on("completed", (job) => console.log(`[Worker] ✅ Render completed: ${job.id}`));
worker.on("failed", (job, err) => console.error(`[Worker] ❌ Render failed: ${job?.id}`, err.message));
console.log("🎬 Render worker started, waiting for jobs...");
