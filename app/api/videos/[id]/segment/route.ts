import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { segmentVideo } from "@/lib/ai";

/**
 * POST /api/videos/[id]/segment
 * Manually trigger AI segmentation for a video
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

    // Load video + transcript (singular relation)
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

    try {
        const segments = transcript.segments as any[];
        const suggestions = await segmentVideo(segments, video.duration || 0);

        // Store segments — use startTime/endTime per schema
        const created = await Promise.all(
            suggestions.map((s) =>
                prisma.segment.create({
                    data: {
                        videoId: id,
                        startTime: s.start,
                        endTime: s.end,
                        title: s.title,
                        description: s.description,
                        aiScore: s.overallScore,
                        status: "AI_SUGGESTED",
                    },
                })
            )
        );

        await prisma.video.update({
            where: { id },
            data: { status: "READY" },
        });

        return NextResponse.json({
            segments: created.length,
            topScore: suggestions[0]?.overallScore || 0,
        });
    } catch (error: any) {
        await prisma.video.update({
            where: { id },
            data: { status: "FAILED" },
        });

        return NextResponse.json(
            { error: "Segmentation failed", details: error.message },
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
