import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getPresignedUploadUrl, generateR2Key } from "@/lib/storage";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * POST /api/videos/upload — Two-step direct-to-R2 upload flow for Library/Studio
 *
 * Step 1 (action: "init"):
 *   Creates Video record, returns a presigned R2 PUT URL.
 *
 * Step 2 (action: "finalize"):
 *   Updates Video record, starts transcription.
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
    } = body;

    if (!fileName) {
        return NextResponse.json({ error: "fileName is required" }, { status: 400 });
    }

    const allowedExts = [".mp4", ".mov", ".webm", ".mkv"];
    const ext = fileName.match(/\.[^.]+$/)?.[0]?.toLowerCase() || ".mp4";
    if (!allowedExts.includes(ext)) {
        return NextResponse.json(
            { error: `Invalid file type: ${ext}. Supported: mp4, mov, webm, mkv` },
            { status: 400 }
        );
    }

    console.log(`[Upload/Init] ${fileName} (${(fileSize / 1024 / 1024).toFixed(1)}MB)`);

    // Create Video record (starts in DOWNLOADING status for upload)
    const video = await prisma.video.create({
        data: {
            userId,
            sourceUrl: `upload://${fileName}`,
            platform: "upload",
            title: title || fileName.replace(/\.[^.]+$/, ""),
            status: "DOWNLOADING",
        },
    });

    const r2Key = generateR2Key(userId, video.id, fileName);
    const uploadUrl = await getPresignedUploadUrl(r2Key, contentType, 3600); // 1 hour

    console.log(`[Upload/Init] Created video=${video.id}, r2Key=${r2Key}`);

    return NextResponse.json({
        videoId: video.id,
        uploadUrl,
        r2Key,
    });
}

async function handleFinalize(body: any, userId: string) {
    const { videoId, r2Key, minDuration, maxDuration, segmentMode, autoSegment = false } = body;

    if (!videoId || !r2Key) {
        return NextResponse.json({ error: "videoId and r2Key are required" }, { status: 400 });
    }

    console.log(`[Upload/Finalize] video=${videoId}, r2Key=${r2Key}`);

    // Update video record with R2 storage key and change status to TRANSCRIBING
    const video = await prisma.video.update({
        where: { id: videoId },
        data: {
            storagePath: r2Key,
            status: "TRANSCRIBING",
        },
    });

    // Enqueue a custom download job (the download worker will verify files/extract audio)
    const downloadQueue = getQueue(QUEUE_NAMES.VIDEO_DOWNLOAD);
    await downloadQueue.add(
        `download-${videoId}`,
        {
            videoId,
            userId,
            sourceUrl: video.sourceUrl,
            platform: "upload",
            autoTranscribe: true,
            autoSegment,
            minDuration,
            maxDuration,
            segmentMode,
        },
        { attempts: 3, backoff: { type: "exponential", delay: 30000 } }
    );

    console.log(`[Upload/Finalize] ✅ Finalized video=${videoId}, enqueued download`);

    return NextResponse.json({
        videoId,
        status: "TRANSCRIBING",
        message: "Upload finalize complete — processing started",
    });
}
