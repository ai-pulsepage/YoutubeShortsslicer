import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";

/**
 * POST /api/clipper/[id]/retry — Retry a failed clip project's pipeline
 * 
 * Re-queues the transcription job for a video that already has a storagePath
 * (i.e., the video was uploaded to R2 but transcription/segmentation failed).
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

    const project = await prisma.clipProject.findUnique({
        where: { id, userId: session.user.id },
        include: { video: true },
    });

    if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.video.storagePath) {
        return NextResponse.json(
            { error: "Video has no storage path — please re-upload" },
            { status: 400 }
        );
    }

    console.log(`[Retry] Retrying project=${id}, video=${project.videoId}, path=${project.video.storagePath}`);

    // Reset video status
    await prisma.video.update({
        where: { id: project.videoId },
        data: { status: "TRANSCRIBING", errorMsg: null },
    });

    // Queue transcription
    const transcriptionQueue = getQueue(QUEUE_NAMES.TRANSCRIPTION);
    await transcriptionQueue.add(
        `transcribe-retry-${project.videoId}`,
        {
            videoId: project.videoId,
            userId: session.user.id,
            storagePath: project.video.storagePath,
        },
        { attempts: 3, backoff: { type: "exponential", delay: 30000 } }
    );

    return NextResponse.json({
        success: true,
        message: "Transcription re-queued",
        videoId: project.videoId,
    });
}
