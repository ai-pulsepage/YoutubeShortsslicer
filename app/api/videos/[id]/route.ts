import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/videos/[id]
 * Delete a video and all associated data (segments, transcripts, short videos, etc.)
 */
export async function DELETE(
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
    });

    if (!video) {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    // Delete from R2 if storage path exists
    if (video.storagePath) {
        try {
            const { deleteFromR2 } = await import("@/lib/storage");
            await deleteFromR2(video.storagePath);
            if (video.audioPath) await deleteFromR2(video.audioPath);
        } catch (e) {
            console.warn("[Delete] R2 cleanup failed, continuing:", e);
        }
    }

    // Cascade delete handles segments, transcript, tags, etc.
    await prisma.video.delete({ where: { id } });

    return NextResponse.json({ deleted: true });
}

/**
 * GET /api/videos/[id]
 * Get a single video with its status (for polling)
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
        include: {
            _count: { select: { segments: true } },
        },
    });

    if (!video) {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    return NextResponse.json(video);
}
