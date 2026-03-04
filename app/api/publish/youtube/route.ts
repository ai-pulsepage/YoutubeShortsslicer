import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadToYouTube, ensureValidToken } from "@/lib/youtube";

/**
 * POST /api/publish/youtube
 * Uploads a rendered short to YouTube.
 *
 * Body: { publishJobId: string }
 *
 * Flow:
 * 1. Load the publish job + short video + channel
 * 2. Refresh token if needed
 * 3. Download the rendered video from R2
 * 4. Upload to YouTube with #Shorts metadata
 * 5. Update publish job status
 */
export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { publishJobId } = await req.json();
    if (!publishJobId) {
        return NextResponse.json({ error: "publishJobId is required" }, { status: 400 });
    }

    try {
        // Load publish job with all related data
        const job = await prisma.publishJob.findUnique({
            where: { id: publishJobId },
            include: {
                shortVideo: {
                    include: {
                        segment: {
                            select: { title: true, description: true },
                        },
                    },
                },
                channel: {
                    select: {
                        id: true,
                        channelName: true,
                        channelId: true,
                        platform: true,
                        userId: true,
                    },
                },
            },
        });

        if (!job) {
            return NextResponse.json({ error: "Publish job not found" }, { status: 404 });
        }

        if (job.channel.userId !== session.user.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        if (job.channel.platform !== "YOUTUBE") {
            return NextResponse.json(
                { error: "This endpoint only handles YouTube publishing" },
                { status: 400 }
            );
        }

        // Update status to PUBLISHING
        await prisma.publishJob.update({
            where: { id: publishJobId },
            data: { status: "PUBLISHING" },
        });

        // Download the rendered short from R2
        const storagePath = job.shortVideo.storagePath;
        if (!storagePath) {
            await prisma.publishJob.update({
                where: { id: publishJobId },
                data: {
                    status: "FAILED",
                    errorMsg: "No rendered video file found. Render the short first.",
                },
            });
            return NextResponse.json(
                { error: "No rendered video available", suggestion: "Render the short video first." },
                { status: 400 }
            );
        }

        // Fetch video from R2
        let videoBuffer: Buffer;
        try {
            const { getR2PublicUrl } = await import("@/lib/storage");
            const videoUrl = getR2PublicUrl(storagePath);
            const videoRes = await fetch(videoUrl);
            if (!videoRes.ok) throw new Error(`R2 fetch failed: ${videoRes.status}`);
            videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        } catch (r2Err: any) {
            await prisma.publishJob.update({
                where: { id: publishJobId },
                data: {
                    status: "FAILED",
                    errorMsg: `Failed to download rendered video: ${r2Err.message}`,
                },
            });
            return NextResponse.json(
                { error: "Failed to download video from storage", suggestion: "Check R2 configuration." },
                { status: 500 }
            );
        }

        // Upload to YouTube
        const title = job.title || job.shortVideo.segment.title || "Short";
        const description = job.description || job.shortVideo.segment.description || "";

        const result = await uploadToYouTube(
            job.channel.id,
            videoBuffer,
            title,
            description,
            job.hashtags,
            "public"
        );

        // Update publish job with success
        await prisma.publishJob.update({
            where: { id: publishJobId },
            data: {
                status: "PUBLISHED",
                publishedAt: new Date(),
                platformVideoId: result.videoId,
            },
        });

        return NextResponse.json({
            success: true,
            videoId: result.videoId,
            url: result.url,
            channelName: job.channel.channelName,
        });
    } catch (error: any) {
        console.error("[Publish YouTube] Error:", error.message);

        // Update publish job with error
        await prisma.publishJob.update({
            where: { id: publishJobId },
            data: {
                status: "FAILED",
                errorMsg: error.message,
            },
        });

        return NextResponse.json(
            {
                error: error.message,
                code: (error as any).code || "unknown",
                suggestion: (error as any).suggestion || "Check the error and try again.",
            },
            { status: 500 }
        );
    }
}
