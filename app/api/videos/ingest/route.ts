import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getQueue, QUEUE_NAMES, VideoDownloadJobData } from "@/lib/queue";

/**
 * POST /api/videos/ingest
 * Start video ingestion: create DB record + enqueue download job
 */
export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { url, tags, autoTranscribe = true, autoSegment = true } = await req.json();
    if (!url?.trim()) {
        return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Detect platform
    const platform = detectPlatform(url);

    // Create video record
    const video = await prisma.video.create({
        data: {
            sourceUrl: url.trim(),
            platform,
            status: "PENDING",
            userId: session.user.id,
        },
    });

    // Assign tags if provided
    if (tags && Array.isArray(tags) && tags.length > 0) {
        await prisma.videoTag.createMany({
            data: tags.map((tagId: string) => ({
                videoId: video.id,
                tagId,
            })),
        });
    }

    // Enqueue download job
    const queue = getQueue(QUEUE_NAMES.VIDEO_DOWNLOAD);
    await queue.add(
        `download-${video.id}`,
        {
            videoId: video.id,
            userId: session.user.id,
            sourceUrl: url.trim(),
            platform,
            autoTranscribe,
            autoSegment,
        } as VideoDownloadJobData,
        {
            priority: 1,
            attempts: 3,
            backoff: { type: "exponential", delay: 30000 },
        }
    );

    // Update status to DOWNLOADING
    await prisma.video.update({
        where: { id: video.id },
        data: { status: "DOWNLOADING" },
    });

    return NextResponse.json(
        {
            id: video.id,
            status: "DOWNLOADING",
            platform,
            message: "Video queued for download",
        },
        { status: 201 }
    );
}

function detectPlatform(url: string): string {
    const u = url.toLowerCase();
    if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
    if (u.includes("vimeo.com")) return "vimeo";
    if (u.includes("tiktok.com")) return "tiktok";
    if (u.includes("instagram.com")) return "instagram";
    if (u.includes("twitch.tv")) return "twitch";
    if (u.includes("twitter.com") || u.includes("x.com")) return "twitter";
    if (u.includes("facebook.com") || u.includes("fb.watch")) return "facebook";
    if (u.includes("reddit.com")) return "reddit";
    if (u.includes("frame.io")) return "frameio";
    return "other";
}
