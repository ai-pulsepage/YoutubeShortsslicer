import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: videoId } = await params;

    const video = await prisma.video.findFirst({
        where: { id: videoId, userId: session.user.id },
        include: { transcript: true },
    });

    if (!video) {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    if (!video.transcript) {
        return NextResponse.json(
            { error: "Video transcript is missing. Transcribe the video first." },
            { status: 400 }
        );
    }

    try {
        const body = await req.json();
        const { minDuration = 30, maxDuration = 60, segmentMode = "standard" } = body;

        // Clear existing segments and short videos for clean regeneration
        const oldSegments = await prisma.segment.findMany({
            where: { videoId },
            select: { id: true },
        });

        if (oldSegments.length > 0) {
            const oldSegIds = oldSegments.map(s => s.id);
            await prisma.shortVideo.deleteMany({
                where: { segmentId: { in: oldSegIds } },
            });
            await prisma.segment.deleteMany({
                where: { videoId },
            });
            console.log(`[GenerateSegments] Cleared ${oldSegments.length} existing segments`);
        }

        // Set video status back to SEGMENTING
        await prisma.video.update({
            where: { id: videoId },
            data: { status: "SEGMENTING" },
        });

        // Enqueue segmentation job
        const segQueue = getQueue(QUEUE_NAMES.SEGMENTATION);
        await segQueue.add(
            `segment-${videoId}`,
            {
                videoId,
                userId: session.user.id,
                transcriptId: video.transcript.id,
                minDuration,
                maxDuration,
                segmentMode,
            },
            { priority: 1 }
        );

        console.log(`[GenerateSegments] Enqueued segmentation job for video=${videoId}`);

        return NextResponse.json({
            success: true,
            status: "SEGMENTING",
            message: "AI segmentation started successfully.",
        });
    } catch (err: any) {
        console.error("[GenerateSegments] Failed to trigger segmentation:", err);
        return NextResponse.json(
            { error: err.message || "Failed to trigger AI segmentation" },
            { status: 500 }
        );
    }
}
