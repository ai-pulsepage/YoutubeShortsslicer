import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * POST /api/videos/[id]/render
 * Queue rendering for all APPROVED segments of a video
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
        include: {
            segments: {
                where: { status: "APPROVED" },
                orderBy: { startTime: "asc" },
            },
        },
    });

    if (!video) {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    if (video.segments.length === 0) {
        return NextResponse.json(
            { error: "No approved segments to render" },
            { status: 400 }
        );
    }

    // Mark segments as queued for rendering
    await prisma.segment.updateMany({
        where: {
            id: { in: video.segments.map((s) => s.id) },
        },
        data: { status: "RENDERING" },
    });

    // Queue render jobs via BullMQ
    try {
        const { Queue } = await import("bullmq");
        const IORedis = (await import("ioredis")).default;
        const redis = new IORedis(process.env.REDIS_URL || "", { maxRetriesPerRequest: null });
        const renderQueue = new Queue("render", { connection: redis as any });

        for (const segment of video.segments) {
            await renderQueue.add(
                `render-${segment.id}`,
                {
                    videoId: id,
                    segmentId: segment.id,
                    userId: session.user.id,
                    startTime: segment.startTime,
                    endTime: segment.endTime,
                    title: segment.title,
                },
                { priority: 1 }
            );
        }

        await redis.quit();

        return NextResponse.json({
            queued: video.segments.length,
            segments: video.segments.map((s) => s.id),
        });
    } catch (err: any) {
        // Revert status on failure
        await prisma.segment.updateMany({
            where: {
                id: { in: video.segments.map((s) => s.id) },
            },
            data: { status: "APPROVED" },
        });

        return NextResponse.json(
            { error: "Failed to queue render jobs", details: err.message },
            { status: 500 }
        );
    }
}
