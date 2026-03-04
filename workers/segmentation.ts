/**
 * Segmentation Worker
 *
 * Processes segmentation jobs:
 * 1. Loads transcript from DB
 * 2. Calls DeepSeek/Gemini for segment suggestions
 * 3. Stores segments in DB with scores
 * 4. Updates video status
 *
 * Run: npx tsx workers/segmentation.ts
 */
import { Worker, Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import IORedis from "ioredis";
import { QUEUE_NAMES, SegmentationJobData } from "../lib/queue";
import { segmentVideo, SegmentSuggestion } from "../lib/ai";

// Direct Prisma + Redis setup (workers run outside Next.js)
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
});

async function processSegmentation(job: Job<SegmentationJobData>) {
    const { videoId, userId, transcriptId } = job.data;

    try {
        console.log(`[Segmentation] Starting: video=${videoId}`);
        await job.updateProgress(10);

        // Load transcript
        const transcript = await prisma.transcript.findUnique({
            where: { id: transcriptId },
            include: { video: { select: { duration: true } } },
        });

        if (!transcript) {
            throw new Error(`Transcript ${transcriptId} not found`);
        }

        const segments = transcript.segments as any[];
        const videoDuration = transcript.video.duration || 0;

        if (!segments || segments.length === 0) {
            throw new Error("Transcript has no segments");
        }

        await job.updateProgress(20);

        // Call AI for segmentation
        console.log(`[Segmentation] Calling AI (${segments.length} transcript segments, ${videoDuration}s video)...`);
        const suggestions = await segmentVideo(segments, videoDuration);

        console.log(`[Segmentation] Got ${suggestions.length} segment suggestions`);
        await job.updateProgress(70);

        // Store segments in database
        for (const suggestion of suggestions) {
            await prisma.segment.create({
                data: {
                    videoId,
                    start: suggestion.start,
                    end: suggestion.end,
                    title: suggestion.title,
                    description: suggestion.description,
                    aiScore: suggestion.overallScore,
                    status: "SUGGESTED",
                },
            });
        }

        await job.updateProgress(90);

        // Update video status
        await prisma.video.update({
            where: { id: videoId },
            data: { status: "READY" },
        });

        console.log(`[Segmentation] Complete: ${suggestions.length} segments stored for video ${videoId}`);
        await job.updateProgress(100);

        return {
            videoId,
            segmentCount: suggestions.length,
            topScore: suggestions[0]?.overallScore || 0,
        };
    } catch (error: any) {
        console.error(`[Segmentation] Failed: ${videoId}`, error.message);

        await prisma.video.update({
            where: { id: videoId },
            data: { status: "FAILED" },
        });

        throw error;
    }
}

// ─── Start Worker ────────────────────────────────
const worker = new Worker<SegmentationJobData>(
    QUEUE_NAMES.SEGMENTATION,
    processSegmentation,
    {
        connection: redis,
        concurrency: 3,
        limiter: {
            max: 10,
            duration: 60000,
        },
    }
);

worker.on("completed", (job) => {
    console.log(`[Worker] ✅ Segmentation completed: ${job.id}`);
});

worker.on("failed", (job, err) => {
    console.error(`[Worker] ❌ Segmentation failed: ${job?.id}`, err.message);
});

console.log("🧠 Segmentation worker started, waiting for jobs...");
