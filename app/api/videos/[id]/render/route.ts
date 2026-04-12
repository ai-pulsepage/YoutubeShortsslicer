import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * POST /api/videos/[id]/render
 *
 * Queue rendering for segments. Supports two modes:
 * 1. Send { segmentIds: [...] } → renders only those specific segments
 *    (must be APPROVED or RENDERED — allows re-render after style/effects changes)
 * 2. Send {} or no body → renders ALL APPROVED segments for the video
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
    const body = await req.json().catch(() => ({}));
    const requestedIds: string[] | undefined = body.segmentIds;

    // Verify video ownership
    const video = await prisma.video.findFirst({
        where: { id, userId: session.user.id },
    });

    if (!video) {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    // Get segments to render
    let segments;
    if (requestedIds && requestedIds.length > 0) {
        // Specific segments requested — allow APPROVED or RENDERED (re-render)
        segments = await prisma.segment.findMany({
            where: {
                id: { in: requestedIds },
                videoId: id,
                status: { in: ["APPROVED", "RENDERED"] },
            },
            orderBy: { startTime: "asc" },
        });
    } else {
        // No specific IDs — render all APPROVED
        segments = await prisma.segment.findMany({
            where: { videoId: id, status: "APPROVED" },
            orderBy: { startTime: "asc" },
        });
    }

    if (segments.length === 0) {
        return NextResponse.json(
            { error: "No eligible segments to render (must be APPROVED or RENDERED)" },
            { status: 400 }
        );
    }

    const segmentIds = segments.map((s) => s.id);

    // Mark segments as queued for rendering
    await prisma.segment.updateMany({
        where: { id: { in: segmentIds } },
        data: { status: "RENDERING" },
    });

    // Queue render jobs via BullMQ
    try {
        const { Queue } = await import("bullmq");
        const IORedis = (await import("ioredis")).default;
        const redis = new IORedis(process.env.REDIS_URL || "", { maxRetriesPerRequest: null });
        const renderQueue = new Queue("render", { connection: redis as any });

        for (const segment of segments) {
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
            queued: segments.length,
            segments: segmentIds,
        });
    } catch (err: any) {
        // Revert status on failure
        await prisma.segment.updateMany({
            where: { id: { in: segmentIds } },
            data: { status: "APPROVED" },
        });

        return NextResponse.json(
            { error: "Failed to queue render jobs", details: err.message },
            { status: 500 }
        );
    }
}
