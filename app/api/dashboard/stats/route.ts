import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const [
        totalVideos,
        totalSegments,
        totalPublished,
        pendingJobs,
        recentVideos,
    ] = await Promise.all([
        prisma.video.count({ where: { userId } }),
        prisma.segment.count({
            where: { video: { userId }, status: { in: ["APPROVED", "RENDERED"] } },
        }),
        prisma.publishJob.count({
            where: { shortVideo: { segment: { video: { userId } } }, status: "PUBLISHED" },
        }),
        prisma.publishJob.count({
            where: {
                shortVideo: { segment: { video: { userId } } },
                status: { in: ["DRAFT", "SCHEDULED"] },
            },
        }),
        prisma.video.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
                id: true,
                title: true,
                status: true,
                thumbnail: true,
                createdAt: true,
                _count: { select: { segments: true } },
            },
        }),
    ]);

    return NextResponse.json({
        stats: {
            totalVideos,
            totalSegments,
            totalPublished,
            pendingJobs,
        },
        recentVideos,
    });
}
