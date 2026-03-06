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

// Write YouTube cookies to temp file for authentication
const COOKIES_PATH = path.join(TEMP_DIR, "cookies.txt");
if (process.env.YOUTUBE_COOKIES) {
    fs.writeFileSync(COOKIES_PATH, process.env.YOUTUBE_COOKIES);
    console.log("  🍪 YouTube cookies loaded");
}

function ytdlpCookieFlag(): string {
    return fs.existsSync(COOKIES_PATH) ? `--cookies "${COOKIES_PATH}"` : "";
}

/**
 * Parse WebVTT subtitle file into transcript segments
 * YouTube auto-captions use VTT format with timestamps like:
 * 00:00:01.000 --> 00:00:04.500
 * Hello world this is a test
 */
function parseVTT(vttContent: string): { start: number; end: number; text: string }[] {
    const segments: { start: number; end: number; text: string }[] = [];
    const lines = vttContent.split("\n");
    let i = 0;

    while (i < lines.length) {
        // Look for timestamp lines: 00:00:01.000 --> 00:00:04.500
        const match = lines[i]?.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
        if (match) {
            const start = vttTimeToSeconds(match[1]);
            const end = vttTimeToSeconds(match[2]);
            i++;

            // Collect text lines until blank line
            const textLines: string[] = [];
            while (i < lines.length && lines[i]?.trim() !== "") {
                // Strip VTT tags like <c> and position metadata
                const clean = lines[i].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
                if (clean) textLines.push(clean);
                i++;
            }

            const text = textLines.join(" ").trim();
            if (text && text.length > 0) {
                // Deduplicate — YouTube auto-captions often repeat content
                const lastSeg = segments[segments.length - 1];
                if (!lastSeg || lastSeg.text !== text) {
                    segments.push({ start, end, text });
                }
            }
        } else {
            i++;
        }
    }

    return segments;
}

function vttTimeToSeconds(time: string): number {
    const parts = time.split(":");
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
}

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
                `yt-dlp ${ytdlpCookieFlag()} --js-runtimes node --remote-components ejs:github --dump-json --no-download "${sourceUrl}"`,
                { encoding: "utf8", timeout: 30000 }
            );
            const metadata = JSON.parse(metadataJson);
            await job.updateProgress(20);

            // Download video
            const outputTemplate = path.join(videoDir, "%(id)s.%(ext)s");
            execSync(
                `yt-dlp ${ytdlpCookieFlag()} --js-runtimes node --remote-components ejs:github -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "${outputTemplate}" "${sourceUrl}"`,
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

            // Download YouTube auto-captions (replaces whisper transcription)
            let transcriptId: string | null = null;
            if (autoTranscribe) {
                try {
                    console.log(`[Download] Fetching YouTube auto-captions...`);
                    execSync(
                        `yt-dlp ${ytdlpCookieFlag()} --js-runtimes node --write-auto-sub --sub-lang "en.*" --sub-format vtt --skip-download -o "${path.join(videoDir, "%(id)s")}" "${sourceUrl}"`,
                        { encoding: "utf8", timeout: 60000 }
                    );

                    // Find the downloaded VTT file
                    const vttFiles = fs.readdirSync(videoDir).filter((f: string) => f.endsWith(".vtt"));
                    if (vttFiles.length > 0) {
                        const vttContent = fs.readFileSync(path.join(videoDir, vttFiles[0]), "utf8");
                        const segments = parseVTT(vttContent);
                        const fullText = segments.map((s: any) => s.text).join(" ");

                        if (segments.length > 0) {
                            const transcript = await prisma.transcript.create({
                                data: {
                                    videoId,
                                    content: fullText,
                                    segments: segments as any,
                                },
                            });
                            transcriptId = transcript.id;
                            console.log(`[Download] Captions saved: ${segments.length} segments, ${fullText.length} chars`);
                        } else {
                            console.warn("[Download] VTT parsed but no segments found");
                        }
                    } else {
                        console.warn("[Download] No auto-captions available for this video");
                    }
                } catch (captionErr: any) {
                    console.warn(`[Download] Caption download failed: ${captionErr.message}`);
                }
            }
            await job.updateProgress(85);

            // Update database
            await prisma.video.update({
                where: { id: videoId },
                data: {
                    title: metadata.title || "Untitled",
                    thumbnail: metadata.thumbnail || null,
                    duration: Math.round(metadata.duration || 0),
                    storagePath,
                    status: transcriptId ? "SEGMENTING" : "READY",
                },
            });

            // Chain to segmentation if we have a transcript
            if (transcriptId && autoSegment) {
                const { Queue } = await import("bullmq");
                const segQueue = new Queue(QUEUE_NAMES.SEGMENTATION, { connection: redis as any });
                await segQueue.add(
                    `segment-${videoId}`,
                    { videoId, userId, transcriptId },
                    { priority: 1 }
                );
                console.log(`[Download] → Chained to segmentation queue`);
            }

            console.log(`[Download] ✅ Complete: ${videoId}`);
            await job.updateProgress(100);

            // Cleanup
            fs.rmSync(videoDir, { recursive: true, force: true });
            return { videoId, storagePath, title: metadata.title, hasTranscript: !!transcriptId };
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
        // Passthrough — actual transcription requires faster-whisper (pip install faster-whisper)
        // See workers/transcription.ts for the full implementation
        console.warn("[Transcription] faster-whisper not installed — marking video as READY");

        // Update video status to READY so it doesn't stay stuck at TRANSCRIBING
        await prisma.video.update({
            where: { id: videoId },
            data: { status: "READY" },
        });

        // Chain to segmentation even without transcript
        try {
            const { Queue } = await import("bullmq");
            const segQueue = new Queue(QUEUE_NAMES.SEGMENTATION, { connection: redis as any });
            await segQueue.add(`segment-${videoId}`, { videoId, userId });
            console.log("[Transcription] → Chained to segmentation queue");
        } catch (chainErr: any) {
            console.warn("[Transcription] Failed to chain to segmentation:", chainErr.message);
        }

        await job.updateProgress(100);
        return { videoId, status: "transcription_skipped" };
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

            // Step 1: Download source video from R2
            const sourceVideo = path.join(renderDir, "source.mp4");
            console.log(`[Render] Downloading from R2: ${segment.video.storagePath}`);
            const { downloadFileFromR2 } = await import("../lib/storage");
            await downloadFileFromR2(segment.video.storagePath, sourceVideo);
            await job.updateProgress(15);

            const cutVideo = path.join(renderDir, "cut.mp4");
            const outputPath = path.join(renderDir, "final.mp4");
            const duration = segment.endTime - segment.startTime;

            // Step 2: Cut segment
            execSync(
                `ffmpeg -ss ${segment.startTime} -i "${sourceVideo}" -t ${duration} -c copy -avoid_negative_ts 1 "${cutVideo}" -y`,
                { timeout: 300000 }
            );
            await job.updateProgress(30);

            // Step 3: Convert to 9:16
            execSync(
                `ffmpeg -i "${cutVideo}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart "${outputPath}" -y`,
                { timeout: 600000 }
            );
            await job.updateProgress(70);

            // Step 4: Generate and mix voiceover if enabled
            if (segment.voiceoverEnabled && segment.voiceoverText) {
                try {
                    console.log(`[Render] Generating voiceover for segment ${segmentId}`);
                    const { generateVoiceover } = await import("../lib/tts");
                    const audioBuffer = await generateVoiceover({
                        text: segment.voiceoverText,
                        voiceId: "bm_george",
                    });

                    const voiceoverPath = path.join(renderDir, "voiceover.wav");
                    fs.writeFileSync(voiceoverPath, audioBuffer);

                    const mixedOutput = path.join(renderDir, "mixed.mp4");
                    execSync(
                        `ffmpeg -i "${outputPath}" -i "${voiceoverPath}" -filter_complex "[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac "${mixedOutput}" -y`,
                        { timeout: 300000 }
                    );
                    fs.renameSync(mixedOutput, outputPath);
                    console.log(`[Render] Voiceover mixed successfully`);
                } catch (ttsErr: any) {
                    console.warn(`[Render] Voiceover skipped: ${ttsErr.message}`);
                }
            }
            await job.updateProgress(85);

            // Step 5: Upload to R2
            const r2Key = `shorts/${userId}/${videoId}/${segmentId}.mp4`;
            const { uploadFileToR2 } = await import("../lib/storage");
            await uploadFileToR2(outputPath, r2Key, "video/mp4");
            await job.updateProgress(95);

            // Step 6: Save to DB (upsert to handle re-renders)
            await prisma.shortVideo.upsert({
                where: { segmentId },
                create: { segmentId, storagePath: r2Key, duration: Math.round(duration), status: "RENDERED" },
                update: { storagePath: r2Key, duration: Math.round(duration), status: "RENDERED" },
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
console.log("   📥 Download worker (concurrency: 1)");
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
