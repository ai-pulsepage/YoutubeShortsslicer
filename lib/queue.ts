import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";

// Redis connection — reuse across queues
let redisConnection: IORedis | null = null;

export function getRedisConnection(): IORedis {
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
}
