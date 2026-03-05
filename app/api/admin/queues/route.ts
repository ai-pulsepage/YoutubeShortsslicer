import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import IORedis from "ioredis";
import { Queue } from "bullmq";

const QUEUE_NAMES = ["video-download", "transcription", "segmentation", "render"];

/**
 * GET /api/admin/queues - Get queue stats
 */
export async function GET() {
    const session = await auth();
    if ((session?.user as any)?.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
        maxRetriesPerRequest: null,
    });

    try {
        const stats = await Promise.all(
            QUEUE_NAMES.map(async (name) => {
                const queue = new Queue(name, { connection: redis as any });
                const [waiting, active, completed, failed, delayed] = await Promise.all([
                    queue.getWaitingCount(),
                    queue.getActiveCount(),
                    queue.getCompletedCount(),
                    queue.getFailedCount(),
                    queue.getDelayedCount(),
                ]);
                await queue.close();
                return { name, waiting, active, completed, failed, delayed };
            })
        );

        return NextResponse.json(stats);
    } finally {
        await redis.quit();
    }
}

/**
 * POST /api/admin/queues - Clear queue jobs
 * Body: { queue: string, type: "failed" | "completed" | "all" }
 */
export async function POST(req: Request) {
    const session = await auth();
    if ((session?.user as any)?.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { queue: queueName, type } = await req.json();

    if (!QUEUE_NAMES.includes(queueName) && queueName !== "all") {
        return NextResponse.json({ error: "Invalid queue name" }, { status: 400 });
    }

    const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
        maxRetriesPerRequest: null,
    });

    try {
        const targets = queueName === "all" ? QUEUE_NAMES : [queueName];
        let cleared = 0;

        for (const name of targets) {
            const queue = new Queue(name, { connection: redis as any });

            if (type === "failed" || type === "all") {
                const failed = await queue.getFailed();
                for (const job of failed) await job.remove();
                cleared += failed.length;
            }
            if (type === "completed" || type === "all") {
                const completed = await queue.getCompleted();
                for (const job of completed) await job.remove();
                cleared += completed.length;
            }
            if (type === "all") {
                const waiting = await queue.getWaiting();
                for (const job of waiting) await job.remove();
                cleared += waiting.length;

                const delayed = await queue.getDelayed();
                for (const job of delayed) await job.remove();
                cleared += delayed.length;
            }

            await queue.close();
        }

        return NextResponse.json({ success: true, cleared });
    } finally {
        await redis.quit();
    }
}
