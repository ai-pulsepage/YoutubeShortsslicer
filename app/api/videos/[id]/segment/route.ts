import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * POST /api/videos/[id]/segment
 * Queue AI segmentation as a background job (avoids HTTP timeout on long videos)
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

    // Load video + transcript
    const video = await prisma.video.findFirst({
        where: { id, userId: session.user.id },
        include: { transcript: true },
    });

    if (!video) {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const transcript = video.transcript;
    if (!transcript) {
        return NextResponse.json(
            { error: "No transcript found. Process the video first." },
            { status: 400 }
        );
    }

    // Update status
    await prisma.video.update({
        where: { id },
        data: { status: "SEGMENTING" },
    });

    // Clear existing segments and their rendered shorts
    const existingSegments = await prisma.segment.findMany({
        where: { videoId: id },
        select: { id: true },
    });
    if (existingSegments.length > 0) {
        await prisma.shortVideo.deleteMany({
            where: { segmentId: { in: existingSegments.map((s) => s.id) } },
        });
        await prisma.segment.deleteMany({
            where: { videoId: id },
        });
    }

    // Queue segmentation as background job
    try {
        const { Queue } = await import("bullmq");
        const IORedis = (await import("ioredis")).default;
        const redis = new IORedis(process.env.REDIS_URL || "", { maxRetriesPerRequest: null });
        const segQueue = new Queue("segmentation", { connection: redis as any });

        await segQueue.add(
            `segment-${id}`,
            {
                videoId: id,
                userId: session.user.id,
                transcriptId: transcript.id,
            },
            { priority: 1 }
        );

        await redis.quit();

        return NextResponse.json({
            status: "queued",
            message: `Segmentation queued. ${existingSegments.length} old segments cleared.`,
        });
    } catch (err: any) {
        await prisma.video.update({
            where: { id },
            data: { status: "FAILED", errorMsg: err.message },
        });
        return NextResponse.json(
            { error: "Failed to queue segmentation", details: err.message },
            { status: 500 }
        );
    }
}

/**
 * GET /api/videos/[id]/segment
 * Get all segments for a video
 */
export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const segments = await prisma.segment.findMany({
        where: { videoId: id, video: { userId: session.user.id } },
        orderBy: { startTime: "asc" },
        include: {
            shortVideo: {
                select: { id: true, status: true, storagePath: true },
            },
        },
    });

    return NextResponse.json(segments);
}
