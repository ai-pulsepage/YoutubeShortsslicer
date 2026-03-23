import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";

// Redis connection — reuse across queues
let redisConnection: any = null;

export function getRedisConnection() {
    if (!redisConnection) {
        redisConnection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
            maxRetriesPerRequest: null, // Required by BullMQ
        });
    }
    return redisConnection;
}

// ─── Queue Names ─────────────────────────────────
export const QUEUE_NAMES = {
    VIDEO_DOWNLOAD: "video-download",
    AUDIO_EXTRACT: "audio-extract",
    TRANSCRIPTION: "transcription",
    SEGMENTATION: "segmentation",
    RENDER: "render",
    PUBLISH: "publish",
} as const;

// ─── Queue Instances ──────────────────────────────
const queues: Map<string, Queue> = new Map();

export function getQueue(name: string): Queue {
    if (!queues.has(name)) {
        queues.set(
            name,
            new Queue(name, {
                connection: getRedisConnection(),
                defaultJobOptions: {
                    attempts: 3,
                    backoff: { type: "exponential", delay: 5000 },
                    removeOnComplete: { count: 100 },
                    removeOnFail: { count: 50 },
                },
            })
        );
    }
    return queues.get(name)!;
}

// ─── Job Types ────────────────────────────────────
export interface VideoDownloadJobData {
    videoId: string;
    userId: string;
    sourceUrl: string;
    platform: string;
    autoTranscribe?: boolean;
    autoSegment?: boolean;
}

export interface AudioExtractJobData {
    videoId: string;
    userId: string;
    videoStoragePath: string;
}

export interface TranscriptionJobData {
    videoId: string;
    userId: string;
    audioStoragePath: string;
}

export interface SegmentationJobData {
    videoId: string;
    userId: string;
    transcriptId: string;
}

export interface RenderJobData {
    segmentId: string;
    userId: string;
    videoId: string;
    // Clip Studio options
    clipMode?: boolean;
    faceTrack?: boolean;
    captionStyle?: string;       // "word-highlight" | "pop" | "fade" | "none"
    subtitleStyle?: any;         // snapshot of SubtitlePreset
    hookOverlay?: boolean;
    hookText?: string;           // on-screen title text
    ctaOverlay?: boolean;
    ctaText?: string;
    editedWords?: Array<{ text: string; start: number; end: number }>;
}

// ─── RunPod Worker Queue (XTTS / MusicGen / Video) ──────
const RUNPOD_QUEUE = "runpod-worker";

/**
 * Add a job to the RunPod worker queue.
 * Returns the job ID for tracking.
 */
export async function addJob(
    jobType: string,
    data: Record<string, any>,
): Promise<string> {
    const queue = getQueue(RUNPOD_QUEUE);
    const job = await queue.add(jobType, {
        type: jobType,
        ...data,
    });
    return job.id || `job-${Date.now()}`;
}

/**
 * Wait for a RunPod job to complete and return its result.
 * Polls the job status until completion or timeout.
 */
export async function waitForJobResult(
    jobId: string,
    timeoutMs: number = 120_000,
): Promise<{ status: string; output_url?: string; audio_base64?: string; error?: string } | null> {
    const queue = getQueue(RUNPOD_QUEUE);
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        const job = await queue.getJob(jobId);
        if (!job) return null;

        const state = await job.getState();

        if (state === "completed") {
            return {
                status: "COMPLETED",
                output_url: job.returnvalue?.output_url,
                audio_base64: job.returnvalue?.audio_base64,
            };
        }

        if (state === "failed") {
            return {
                status: "FAILED",
                error: job.failedReason || "Unknown error",
            };
        }

        // Wait 2s before polling again
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return { status: "FAILED", error: "Timeout waiting for job result" };
}
