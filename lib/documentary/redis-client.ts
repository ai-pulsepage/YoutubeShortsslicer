import Redis from "ioredis";

let redis: Redis | null = null;

export function getRedis(): Redis {
    if (!redis) {
        const url = process.env.REDIS_URL;
        if (!url) {
            throw new Error("REDIS_URL environment variable is not set");
        }
        redis = new Redis(url, {
            maxRetriesPerRequest: 3,
            retryStrategy(times) {
                const delay = Math.min(times * 200, 5000);
                return delay;
            },
            lazyConnect: true,
        });

        redis.on("error", (err) => {
            console.error("[Redis] Connection error:", err.message);
        });

        redis.on("connect", () => {
            console.log("[Redis] Connected successfully");
        });
    }
    return redis;
}

// Pub/Sub channels
export const CHANNELS = {
    DOCUMENTARY_JOBS: "documentary_jobs",
    DOCUMENTARY_RESULTS: "documentary_results",
} as const;

// Job types dispatched to RunPod
export type JobType = "ref_image" | "shot_video" | "narration" | "filler";

export interface RedisJob {
    jobId: string;
    documentaryId: string;
    type: JobType;
    prompt: string;
    referenceImages: string[];
    metadata: Record<string, unknown>;
}

export interface RedisJobResult {
    jobId: string;
    status: "completed" | "failed";
    outputPath?: string;
    errorMsg?: string;
}
