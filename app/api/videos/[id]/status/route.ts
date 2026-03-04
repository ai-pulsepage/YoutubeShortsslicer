import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET /api/videos/[id]/status
 * Poll video processing status
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

    const video = await prisma.video.findFirst({
        where: { id, userId: session.user.id },
        select: {
            id: true,
            title: true,
            status: true,
            thumbnail: true,
            duration: true,
            platform: true,
            storagePath: true,
            createdAt: true,
            _count: { select: { segments: true } },
        },
    });

    if (!video) {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    return NextResponse.json(video);
}
