import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * POST /api/videos/[id]/retranscribe
 * Re-transcribe an existing video using Whisper (without re-downloading).
 * Queues a background job in the transcription worker.
 */
export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const video = await prisma.video.findFirst({
        where: { id, userId: session.user.id },
        select: { id: true, storagePath: true, duration: true },
    });

    if (!video) {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    if (!video.storagePath) {
        return NextResponse.json({ error: "No video file in storage" }, { status: 400 });
    }

    if (!process.env.TOGETHER_API_KEY) {
        return NextResponse.json({ error: "TOGETHER_API_KEY not configured" }, { status: 500 });
    }

    // Update status
    await prisma.video.update({
        where: { id },
        data: { status: "TRANSCRIBING" },
    });

    // Queue re-transcription as background job (same pattern as segment route)
    try {
        const { Queue } = await import("bullmq");
        const IORedis = (await import("ioredis")).default;
        const redis = new IORedis(process.env.REDIS_URL || "", { maxRetriesPerRequest: null });
        const queue = new Queue("transcription", { connection: redis as any });

        await queue.add(
            `retranscribe-${id}`,
            {
                videoId: id,
                userId: session.user.id,
                storagePath: video.storagePath,
                retranscribe: true,
            },
            { priority: 1 }
        );

        await redis.quit();

        return NextResponse.json({
            status: "queued",
            message: "Re-transcription with Whisper queued. This will take 1-2 minutes.",
        });
    } catch (err: any) {
        console.error("[Retranscribe] Queue error:", err);
        await prisma.video.update({
            where: { id },
            data: { status: "FAILED", errorMsg: err.message },
        });
        return NextResponse.json(
            { error: "Failed to queue re-transcription", details: err.message },
            { status: 500 }
        );
    }
}
