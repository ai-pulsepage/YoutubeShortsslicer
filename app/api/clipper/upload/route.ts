import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getPresignedUploadUrl, generateR2Key } from "@/lib/storage";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";

// Allow large file uploads
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * POST /api/clipper/upload — Two-step direct-to-R2 upload flow
 *
 * Step 1 (action: "init"):
 *   Creates Video + ClipProject records, returns a presigned R2 PUT URL.
 *   Frontend uploads directly to R2 (bypasses Railway proxy).
 *
 * Step 2 (action: "finalize"):
 *   After upload completes, kicks off the transcription → segmentation pipeline.
 */
export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { action } = body;

        if (action === "init") {
            return handleInit(body, session.user.id);
        } else if (action === "finalize") {
            return handleFinalize(body, session.user.id);
        } else {
            return NextResponse.json({ error: "Invalid action. Use 'init' or 'finalize'." }, { status: 400 });
        }
    } catch (error: any) {
        console.error("[Upload] Error:", error.message);
        return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 });
    }
}

async function handleInit(body: any, userId: string) {
    const {
        fileName,
        fileSize,
        contentType = "video/mp4",
        title,
        campaignName,
        campaignCpm,
        captionStyle = "word-highlight",
        faceTrack = true,
    } = body;

    if (!fileName) {
        return NextResponse.json({ error: "fileName is required" }, { status: 400 });
    }

    // Validate file type
    const allowedExts = [".mp4", ".mov", ".webm", ".mkv"];
    const ext = fileName.match(/\.[^.]+$/)?.[0]?.toLowerCase() || ".mp4";
    if (!allowedExts.includes(ext)) {
        return NextResponse.json(
            { error: `Invalid file type: ${ext}. Supported: mp4, mov, webm, mkv` },
            { status: 400 }
        );
    }

    console.log(`[Upload/Init] ${fileName} (${(fileSize / 1024 / 1024).toFixed(1)}MB)`);

    // Create Video record
    const video = await prisma.video.create({
        data: {
            userId,
            sourceUrl: `upload://${fileName}`,
            platform: "upload",
            title: title || fileName.replace(/\.[^.]+$/, ""),
            status: "DOWNLOADING", // Will change to TRANSCRIBING after finalize
        },
    });

    // Create ClipProject
    const project = await prisma.clipProject.create({
        data: {
            userId,
            videoId: video.id,
            campaignName: campaignName || null,
            campaignCpm: campaignCpm ? parseFloat(campaignCpm) : null,
            captionStyle,
            faceTrack,
        },
    });

    // Generate R2 key and presigned upload URL
    const r2Key = generateR2Key(userId, video.id, fileName);
    const uploadUrl = await getPresignedUploadUrl(r2Key, contentType, 3600); // 1 hour

    console.log(`[Upload/Init] Created video=${video.id}, project=${project.id}, r2Key=${r2Key}`);

    return NextResponse.json({
        videoId: video.id,
        projectId: project.id,
        uploadUrl,
        r2Key,
    });
}

async function handleFinalize(body: any, userId: string) {
    const { videoId, projectId, r2Key } = body;

    if (!videoId || !r2Key) {
        return NextResponse.json({ error: "videoId and r2Key are required" }, { status: 400 });
    }

    console.log(`[Upload/Finalize] video=${videoId}, r2Key=${r2Key}`);

    // Update video record with storage path
    await prisma.video.update({
        where: { id: videoId },
        data: {
            storagePath: r2Key,
            status: "TRANSCRIBING",
        },
    });

    // Queue transcription (the worker will download from R2, extract audio, transcribe)
    const transcriptionQueue = getQueue(QUEUE_NAMES.TRANSCRIPTION);
    await transcriptionQueue.add(
        `transcribe-${videoId}`,
        {
            videoId,
            userId,
            storagePath: r2Key,
            autoSegment: true,
        },
        { attempts: 3, backoff: { type: "exponential", delay: 30000 } }
    );

    console.log(`[Upload/Finalize] ✅ Queued transcription for ${videoId}`);

    return NextResponse.json({
        videoId,
        projectId,
        status: "TRANSCRIBING",
        message: "Upload complete — transcription started",
    });
}
