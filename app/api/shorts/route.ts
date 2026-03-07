import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET /api/shorts
 * Get all rendered short videos for the current user.
 * Optional query params: ?tag=tagId to filter by video tag (batch)
 */
export async function GET(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const tagId = searchParams.get("tag");

    const where: any = {
        segment: {
            video: { userId: session.user.id },
        },
    };

    // Filter by tag (batch) if specified
    if (tagId) {
        where.segment.video.videoTags = {
            some: { tagId },
        };
    }

    const shorts = await prisma.shortVideo.findMany({
        where,
        include: {
            segment: {
                select: {
                    id: true,
                    title: true,
                    startTime: true,
                    endTime: true,
                    aiScore: true,
                    video: {
                        select: {
                            id: true,
                            title: true,
                            videoTags: {
                                include: { tag: { select: { id: true, name: true, color: true } } },
                            },
                        },
                    },
                },
            },
        },
        orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(shorts);
}
