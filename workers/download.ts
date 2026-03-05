/**
 * Video Download Worker
 *
 * Processes download jobs from BullMQ queue:
 * 1. Downloads video using yt-dlp
 * 2. Extracts metadata (title, thumbnail, duration)
 * 3. Uploads to Cloudflare R2
 * 4. Extracts audio track for transcription
 * 5. Updates database and enqueues next pipeline step
 *
 * Run separately: npx tsx workers/download.ts
 */
import { Worker, Job } from "bullmq";
import { execSync, exec } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import IORedis from "ioredis";
import { uploadFileToR2, generateR2Key, generateAudioR2Key } from "../lib/storage";
import { QUEUE_NAMES, VideoDownloadJobData, AudioExtractJobData } from "../lib/queue";
import { Queue } from "bullmq";

// Direct Prisma + Redis setup (workers run outside Next.js)
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
});

const TEMP_DIR = path.join(os.tmpdir(), "yt-shorts-slicer");

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

async function processDownload(job: Job<VideoDownloadJobData>) {
    const { videoId, userId, sourceUrl, platform } = job.data;
    const videoDir = path.join(TEMP_DIR, videoId);

    try {
        // Create temp directory for this video
        if (!fs.existsSync(videoDir)) {
            fs.mkdirSync(videoDir, { recursive: true });
        }

        console.log(`[Download] Starting: ${sourceUrl}`);
        await job.updateProgress(10);

        // Step 1: Get metadata
        const metadataJson = execSync(
            `yt-dlp --js-runtimes node --dump-json --no-download "${sourceUrl}"`,
            { encoding: "utf8", timeout: 30000 }
        );
        const metadata = JSON.parse(metadataJson);
        await job.updateProgress(20);

        // Step 2: Download video (best quality, mp4 preferred)
        const outputTemplate = path.join(videoDir, "%(id)s.%(ext)s");
        execSync(
            `yt-dlp --js-runtimes node -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "${outputTemplate}" "${sourceUrl}"`,
            {
                encoding: "utf8",
                timeout: 600000, // 10 minute timeout
                maxBuffer: 50 * 1024 * 1024,
            }
        );
        await job.updateProgress(50);

        // Find the downloaded file
        const files = fs.readdirSync(videoDir);
        const videoFile = files.find((f) => f.endsWith(".mp4") || f.endsWith(".mkv") || f.endsWith(".webm"));
        if (!videoFile) {
            throw new Error("Downloaded video file not found");
        }
        const localVideoPath = path.join(videoDir, videoFile);

        // Step 3: Upload video to R2
        const r2Key = generateR2Key(userId, videoId, videoFile);
        console.log(`[Download] Uploading to R2: ${r2Key}`);
        await uploadFileToR2(localVideoPath, r2Key, "video/mp4");
        await job.updateProgress(70);

        // Step 4: Extract audio for transcription
        const audioPath = path.join(videoDir, "audio.wav");
        try {
            execSync(
                `ffmpeg -i "${localVideoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}" -y`,
                { timeout: 300000 }
            );

            const audioR2Key = generateAudioR2Key(userId, videoId);
            await uploadFileToR2(audioPath, audioR2Key, "audio/wav");
            await job.updateProgress(85);
        } catch (ffmpegError) {
            console.warn("[Download] FFmpeg audio extraction failed, will retry later:", ffmpegError);
        }

        // Step 5: Download thumbnail
        let thumbnailUrl = metadata.thumbnail || null;

        // Step 6: Update database
        await prisma.video.update({
            where: { id: videoId },
            data: {
                title: metadata.title || "Untitled",
                thumbnail: thumbnailUrl,
                duration: Math.round(metadata.duration || 0),
                storagePath: r2Key,
                status: "TRANSCRIBING", // Ready for next pipeline stage
            },
        });

        // Step 7: Enqueue transcription job (Phase 4)
        // const transcriptionQueue = new Queue(QUEUE_NAMES.TRANSCRIPTION, { connection: redis });
        // await transcriptionQueue.add(`transcribe-${videoId}`, { videoId, userId, audioStoragePath: audioR2Key });

        console.log(`[Download] Complete: ${videoId} → ${r2Key}`);
        await job.updateProgress(100);

        // Cleanup temp files
        fs.rmSync(videoDir, { recursive: true, force: true });

        return { videoId, r2Key, title: metadata.title };
    } catch (error: any) {
        console.error(`[Download] Failed: ${videoId}`, error.message);

        // Update DB status to failed
        await prisma.video.update({
            where: { id: videoId },
            data: { status: "FAILED" },
        });

        // Cleanup temp files
        if (fs.existsSync(videoDir)) {
            fs.rmSync(videoDir, { recursive: true, force: true });
        }

        throw error;
    }
}

// ─── Start Worker ────────────────────────────────
const worker = new Worker<VideoDownloadJobData>(
    QUEUE_NAMES.VIDEO_DOWNLOAD,
    processDownload,
    {
        connection: redis,
        concurrency: 2,
        limiter: {
            max: 5,
            duration: 60000, // 5 downloads per minute
        },
    }
);

worker.on("completed", (job) => {
    console.log(`[Worker] ✅ Download completed: ${job.id}`);
});

worker.on("failed", (job, err) => {
    console.error(`[Worker] ❌ Download failed: ${job?.id}`, err.message);
});

worker.on("active", (job) => {
    console.log(`[Worker] 🔄 Processing: ${job.id}`);
});

console.log("🚀 Download worker started, waiting for jobs...");
