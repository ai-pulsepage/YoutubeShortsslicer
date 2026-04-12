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
        include: {
            segments: {
                include: {
                    shortVideo: { select: { storagePath: true, thumbnailPath: true } },
                },
            },
        },
    });

    if (!video) {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    try {
        // Clean R2 storage — source video + audio
        if (video.storagePath || video.audioPath) {
            try {
                const { deleteFromR2 } = await import("@/lib/storage");
                if (video.storagePath) await deleteFromR2(video.storagePath);
                if (video.audioPath) await deleteFromR2(video.audioPath);
            } catch (e) {
                console.warn("[Delete] R2 source cleanup failed, continuing:", e);
            }
        }

        // Clean R2 storage — rendered shorts
        try {
            const { deleteFromR2 } = await import("@/lib/storage");
            for (const segment of video.segments) {
                const sv = segment.shortVideo;
                if (sv?.storagePath) await deleteFromR2(sv.storagePath).catch(() => {});
                if (sv?.thumbnailPath) await deleteFromR2(sv.thumbnailPath).catch(() => {});
            }
        } catch (e) {
            console.warn("[Delete] R2 shorts cleanup failed, continuing:", e);
        }

        // Cascade delete handles segments, transcript, tags, shorts, publish jobs, etc.
        await prisma.video.delete({ where: { id } });

        return NextResponse.json({ deleted: true });
    } catch (err: any) {
        console.error("[Delete] Failed to delete video:", err);
        return NextResponse.json(
            { error: err.message || "Failed to delete video" },
            { status: 500 }
        );
    }
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
