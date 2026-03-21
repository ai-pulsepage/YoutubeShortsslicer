import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";

/**
 * GET /api/clipper — List all clip projects for the current user
 * POST /api/clipper — Create a new clip project (ingest a video URL)
 */

export async function GET(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const projects = await prisma.clipProject.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        include: {
            video: {
                select: {
                    id: true,
                    title: true,
                    thumbnail: true,
                    duration: true,
                    status: true,
                    sourceUrl: true,
                },
            },
        },
    });

    // For each READY project, also count rendered clips
    const projectsWithCounts = await Promise.all(
        projects.map(async (p) => {
            const totalSegments = await prisma.segment.count({
                where: { videoId: p.videoId },
            });
            const renderedClips = await prisma.shortVideo.count({
                where: {
                    segment: { videoId: p.videoId },
                    status: "RENDERED",
                },
            });
            return {
                ...p,
                totalSegments,
                renderedClips,
            };
        })
    );

    return NextResponse.json(projectsWithCounts);
}

export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
        sourceUrl,
        campaignName,
        campaignCpm,
        campaignPlatforms,
        captionStyle,
        faceTrack,
        hookOverlay,
        ctaOverlay,
        ctaText,
    } = body;

    if (!sourceUrl) {
        return NextResponse.json(
            { error: "sourceUrl is required" },
            { status: 400 }
        );
    }

    // Detect platform from URL
    let platform = "youtube";
    if (sourceUrl.includes("tiktok.com")) platform = "tiktok";
    else if (sourceUrl.includes("twitch.tv")) platform = "twitch";
    else if (sourceUrl.includes("instagram.com")) platform = "instagram";

    try {
        // Step 1: Create the Video record (reuses existing download pipeline)
        const video = await prisma.video.create({
            data: {
                userId: session.user.id,
                sourceUrl,
                platform,
                status: "PENDING",
            },
        });

        // Step 2: Create the ClipProject
        const project = await prisma.clipProject.create({
            data: {
                userId: session.user.id,
                videoId: video.id,
                campaignName: campaignName || null,
                campaignCpm: campaignCpm ? parseFloat(campaignCpm) : null,
                campaignPlatforms: campaignPlatforms || ["tiktok", "instagram"],
                captionStyle: captionStyle || "word-highlight",
                faceTrack: faceTrack !== false,
                hookOverlay: hookOverlay !== false,
                ctaOverlay: ctaOverlay !== false,
                ctaText: ctaText || "Follow for more",
            },
        });

        // Step 3: Queue the download job (triggers download → transcribe → segment pipeline)
        const downloadQueue = getQueue(QUEUE_NAMES.VIDEO_DOWNLOAD);
        await downloadQueue.add("download", {
            videoId: video.id,
            userId: session.user.id,
            sourceUrl,
            platform,
            autoTranscribe: true,
            autoSegment: true,
            clipMode: true, // Flag for using clipping-optimized segmentation
            clipProjectId: project.id,
        });

        console.log(
            `[Clipper] Created project ${project.id} for ${sourceUrl} (campaign: ${campaignName || "none"})`
        );

        return NextResponse.json(
            {
                projectId: project.id,
                videoId: video.id,
                status: "DOWNLOADING",
                message: "Video download started — clips will be generated automatically",
            },
            { status: 201 }
        );
    } catch (error: any) {
        console.error("[Clipper] Error creating project:", error.message);
        return NextResponse.json(
            { error: `Failed to create clip project: ${error.message}` },
            { status: 500 }
        );
    }
}
