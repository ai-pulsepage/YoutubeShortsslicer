/**
 * Combined Worker Runner
 * 
 * Starts all BullMQ workers in a single process.
 * Run: npx tsx workers/index.ts
 * 
 * Each worker listens on its own queue and processes jobs concurrently.
 */
import { Worker, Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import IORedis from "ioredis";

// ─── Shared Setup ────────────────────────────────
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
});

const QUEUE_NAMES = {
    VIDEO_DOWNLOAD: "video-download",
    TRANSCRIPTION: "transcription",
    SEGMENTATION: "segmentation",
    RENDER: "render",
} as const;

console.log("═══════════════════════════════════════════");
console.log("  YouTube Shorts Slicer — Worker Runner");
console.log("═══════════════════════════════════════════");
console.log(`  Redis: ${process.env.REDIS_URL ? "Connected" : "localhost"}`);
console.log(`  DB:    ${process.env.DATABASE_URL ? "Connected" : "missing!"}`);
console.log("═══════════════════════════════════════════\n");

// ─── Download Worker ─────────────────────────────
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

const TEMP_DIR = path.join(os.tmpdir(), "yt-shorts-slicer");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const downloadWorker = new Worker(
    QUEUE_NAMES.VIDEO_DOWNLOAD,
    async (job: Job) => {
        const { videoId, userId, sourceUrl, autoTranscribe = true, autoSegment = true } = job.data;
        const videoDir = path.join(TEMP_DIR, videoId);

        try {
            if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });
            console.log(`[Download] Starting: ${sourceUrl}`);
            console.log(`[Download] Pipeline: transcribe=${autoTranscribe}, segment=${autoSegment}`);
            await job.updateProgress(10);

            // Get metadata
            const metadataJson = execSync(
                `yt-dlp --js-runtimes node --remote-components ejs:github --dump-json --no-download "${sourceUrl}"`,
                { encoding: "utf8", timeout: 30000 }
            );
            const metadata = JSON.parse(metadataJson);
            await job.updateProgress(20);

            // Download video
            const outputTemplate = path.join(videoDir, "%(id)s.%(ext)s");
            execSync(
                `yt-dlp --js-runtimes node --remote-components ejs:github -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "${outputTemplate}" "${sourceUrl}"`,
                { encoding: "utf8", timeout: 600000, maxBuffer: 50 * 1024 * 1024 }
            );
            await job.updateProgress(50);

            const files = fs.readdirSync(videoDir);
            const videoFile = files.find((f) => f.endsWith(".mp4") || f.endsWith(".mkv") || f.endsWith(".webm"));
            if (!videoFile) throw new Error("Downloaded video file not found");

            const localVideoPath = path.join(videoDir, videoFile);

            // Upload to R2 (if configured)
            let storagePath = `videos/${userId}/${videoId}/source.mp4`;
            try {
                const { uploadFileToR2 } = await import("../lib/storage");
                await uploadFileToR2(localVideoPath, storagePath, "video/mp4");
                console.log(`[Download] Uploaded to R2: ${storagePath}`);
            } catch (r2Err: any) {
                console.warn(`[Download] R2 upload skipped: ${r2Err.message}`);
                storagePath = localVideoPath; // fallback to local path
            }
            await job.updateProgress(70);

            // Extract audio
            let audioStoragePath: string | null = null;
            const audioPath = path.join(videoDir, "audio.wav");
            try {
                execSync(
                    `ffmpeg -i "${localVideoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}" -y`,
                    { timeout: 300000 }
                );

                // Upload audio to R2
                const audioR2Key = `videos/${userId}/${videoId}/audio.wav`;
                try {
                    const { uploadFileToR2 } = await import("../lib/storage");
                    await uploadFileToR2(audioPath, audioR2Key, "audio/wav");
                    audioStoragePath = audioR2Key;
                } catch {
                    audioStoragePath = audioPath;
                }
            } catch (ffErr) {
                console.warn("[Download] Audio extraction failed, will retry later");
            }
            await job.updateProgress(85);

            // Update database
            const newStatus = autoTranscribe ? "TRANSCRIBING" : "READY";
            await prisma.video.update({
                where: { id: videoId },
                data: {
                    title: metadata.title || "Untitled",
                    thumbnail: metadata.thumbnail || null,
                    duration: Math.round(metadata.duration || 0),
                    storagePath,
                    audioPath: audioStoragePath,
                    status: newStatus,
                },
            });

            // Chain: enqueue transcription if enabled
            if (autoTranscribe && audioStoragePath) {
                const { Queue } = await import("bullmq");
                const transcriptionQueue = new Queue(QUEUE_NAMES.TRANSCRIPTION, { connection: redis as any });
                await transcriptionQueue.add(
                    `transcribe-${videoId}`,
                    {
                        videoId,
                        userId,
                        audioStoragePath,
                        autoSegment,  // pass through so transcription can chain into segmentation
                    },
                    { priority: 1 }
                );
                console.log(`[Download] → Chained to transcription queue`);
            }

            console.log(`[Download] ✅ Complete: ${videoId}`);
            await job.updateProgress(100);

            // Cleanup
            fs.rmSync(videoDir, { recursive: true, force: true });
            return { videoId, storagePath, title: metadata.title };
        } catch (error: any) {
            console.error(`[Download] ❌ Failed: ${videoId}`, error.message);
            await prisma.video.update({
                where: { id: videoId },
                data: { status: "FAILED", errorMsg: error.message },
            });
            if (fs.existsSync(videoDir)) fs.rmSync(videoDir, { recursive: true, force: true });
            throw error;
        }
    },
    {
        connection: redis as any,
        concurrency: 1,
        lockDuration: 600000,      // 10 minutes — long videos take time
        stalledInterval: 300000,   // 5 minutes — don't mark as stalled too early
        settings: {
            backoffStrategy: (attemptsMade: number) => {
                // Exponential backoff: 30s, 60s, 120s, 240s, 480s
                return Math.min(30000 * Math.pow(2, attemptsMade - 1), 480000);
            },
        },
    }
);

// ─── Transcription Worker ────────────────────────
const transcriptionWorker = new Worker(
    QUEUE_NAMES.TRANSCRIPTION,
    async (job: Job) => {
        const { videoId, userId, transcriptId } = job.data;
        console.log(`[Transcription] Starting: video=${videoId}`);
        // Placeholder — requires faster-whisper or Whisper API
        console.warn("[Transcription] Service not yet configured");
        await job.updateProgress(100);
        return { videoId, status: "needs_configuration" };
    },
    { connection: redis as any, concurrency: 1 }
);

// ─── Segmentation Worker ─────────────────────────
const segmentationWorker = new Worker(
    QUEUE_NAMES.SEGMENTATION,
    async (job: Job) => {
        const { videoId, userId, transcriptId } = job.data;
        console.log(`[Segmentation] Starting: video=${videoId}`);

        try {
            const transcript = await prisma.transcript.findUnique({
                where: { id: transcriptId },
                include: { video: { select: { duration: true } } },
            });

            if (!transcript) throw new Error(`Transcript ${transcriptId} not found`);

            const segments = transcript.segments as any[];
            const videoDuration = transcript.video.duration || 0;

            if (!segments || segments.length === 0) throw new Error("Transcript has no segments");
            await job.updateProgress(20);

            // Call AI for segmentation
            const { segmentVideo } = await import("../lib/ai");
            const suggestions = await segmentVideo(segments, videoDuration);
            console.log(`[Segmentation] Got ${suggestions.length} suggestions`);
            await job.updateProgress(70);

            for (const suggestion of suggestions) {
                await prisma.segment.create({
                    data: {
                        videoId,
                        startTime: suggestion.start,
                        endTime: suggestion.end,
                        title: suggestion.title,
                        description: suggestion.description,
                        aiScore: suggestion.overallScore,
                        status: "AI_SUGGESTED",
                    },
                });
            }

            await prisma.video.update({
                where: { id: videoId },
                data: { status: "READY" },
            });

            console.log(`[Segmentation] ✅ Complete: ${suggestions.length} segments`);
            await job.updateProgress(100);
            return { videoId, segmentCount: suggestions.length };
        } catch (error: any) {
            console.error(`[Segmentation] ❌ Failed: ${videoId}`, error.message);
            await prisma.video.update({
                where: { id: videoId },
                data: { status: "FAILED", errorMsg: error.message },
            });
            throw error;
        }
    },
    { connection: redis as any, concurrency: 3 }
);

// ─── Render Worker ───────────────────────────────
const renderWorker = new Worker(
    QUEUE_NAMES.RENDER,
    async (job: Job) => {
        const { segmentId, userId, videoId } = job.data;
        console.log(`[Render] Starting: segment=${segmentId}`);

        try {
            const segment = await prisma.segment.findUnique({
                where: { id: segmentId },
                include: { video: true },
            });

            if (!segment) throw new Error(`Segment ${segmentId} not found`);
            if (!segment.video.storagePath) throw new Error("Video has no storage path");

            const renderDir = path.join(TEMP_DIR, "render", segmentId);
            if (!fs.existsSync(renderDir)) fs.mkdirSync(renderDir, { recursive: true });

            const sourceVideo = segment.video.storagePath;
            const cutVideo = path.join(renderDir, "cut.mp4");
            const outputPath = path.join(renderDir, "final.mp4");
            const duration = segment.endTime - segment.startTime;

            // Cut segment
            execSync(
                `ffmpeg -ss ${segment.startTime} -i "${sourceVideo}" -t ${duration} -c copy -avoid_negative_ts 1 "${cutVideo}" -y`,
                { timeout: 300000 }
            );
            await job.updateProgress(30);

            // Convert to 9:16
            execSync(
                `ffmpeg -i "${cutVideo}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart "${outputPath}" -y`,
                { timeout: 600000 }
            );
            await job.updateProgress(70);

            // Upload to R2
            const r2Key = `shorts/${userId}/${videoId}/${segmentId}.mp4`;
            try {
                const { uploadFileToR2 } = await import("../lib/storage");
                await uploadFileToR2(outputPath, r2Key, "video/mp4");
            } catch (r2Err: any) {
                console.warn(`[Render] R2 upload skipped: ${r2Err.message}`);
            }
            await job.updateProgress(95);

            // Save to DB
            await prisma.shortVideo.create({
                data: { segmentId, storagePath: r2Key, duration: Math.round(duration), status: "RENDERED" },
            });
            await prisma.segment.update({
                where: { id: segmentId },
                data: { status: "RENDERED" },
            });

            fs.rmSync(renderDir, { recursive: true, force: true });
            console.log(`[Render] ✅ Complete: ${segmentId}`);
            await job.updateProgress(100);
            return { segmentId, r2Key, duration };
        } catch (error: any) {
            console.error(`[Render] ❌ Failed: ${segmentId}`, error.message);
            throw error;
        }
    },
    { connection: redis as any, concurrency: 2 }
);

// ─── Event Handlers ──────────────────────────────
const workers = [
    { name: "Download", worker: downloadWorker },
    { name: "Transcription", worker: transcriptionWorker },
    { name: "Segmentation", worker: segmentationWorker },
    { name: "Render", worker: renderWorker },
];

for (const { name, worker } of workers) {
    worker.on("completed", (job) => console.log(`  ✅ ${name} completed: ${job.id}`));
    worker.on("failed", (job, err) => console.error(`  ❌ ${name} failed: ${job?.id}`, err.message));
}

console.log("🚀 All workers started:");
console.log("   📥 Download worker (concurrency: 2)");
console.log("   🎤 Transcription worker (concurrency: 1)");
console.log("   🧠 Segmentation worker (concurrency: 3)");
console.log("   🎬 Render worker (concurrency: 2)");
console.log("\nWaiting for jobs...\n");

// Keep alive
process.on("SIGTERM", async () => {
    console.log("\n⏹ Shutting down workers...");
    await Promise.all(workers.map(({ worker }) => worker.close()));
    await pool.end();
    process.exit(0);
});
