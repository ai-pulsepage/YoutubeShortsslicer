import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";

/**
 * POST /api/clipper/[id]/render — Render specific segments as polished clips
 * Body: { segmentIds: string[] } or { all: true }
 *
 * Subtitle and hook styles are read from each segment's DB record (per-clip settings).
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
    const body = await req.json();
    const { segmentIds, all } = body;

    // Verify project ownership + load campaign brief
    const project = await prisma.clipProject.findUnique({
        where: { id, userId: session.user.id },
        include: { video: true, brief: true },
    });

    if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Get on-screen suggestions from campaign brief for auto hookText
    const onScreenSuggestions = (project.brief as any)?.onScreenSuggestions as string[] || [];

    // Get segments to render
    let segments;
    if (all) {
        segments = await prisma.segment.findMany({
            where: {
                videoId: project.videoId,
                aiScore: { gte: 7 },
                status: { in: ["AI_SUGGESTED", "APPROVED", "RENDERED"] },
            },
        });
    } else if (segmentIds && Array.isArray(segmentIds)) {
        segments = await prisma.segment.findMany({
            where: {
                id: { in: segmentIds },
                videoId: project.videoId,
            },
        });
    } else {
        return NextResponse.json(
            { error: "Provide segmentIds array or all: true" },
            { status: 400 }
        );
    }

    if (segments.length === 0) {
        return NextResponse.json(
            { error: "No segments to render" },
            { status: 400 }
        );
    }

    // Queue render jobs — styles come from each segment's DB record
    const renderQueue = getQueue(QUEUE_NAMES.RENDER);
    const jobs = [];

    for (const segment of segments) {
        await prisma.segment.update({
            where: { id: segment.id },
            data: { status: "RENDERING" },
        });

        // Auto-generate hookText: user edit > campaign suggestion + clip title
        let resolvedHookText = segment.hookText || null;
        if (!resolvedHookText && onScreenSuggestions.length > 0) {
            const suggestion = onScreenSuggestions[Math.floor(Math.random() * onScreenSuggestions.length)];
            resolvedHookText = [suggestion, segment.title].filter(Boolean).join(" ");
        }

        // Build subtitle style from segment's per-clip fields
        const subtitleStyle = {
            animation: segment.subAnimation || "word-highlight",
            font: segment.subFont || "Montserrat",
            position: segment.subPosition || "bottom",
            color: segment.subColor || "#FFFFFF",
            fontSize: segment.subFontSize || 64,
            highlightColor: segment.subHighlightColor || "#00CCFF",
        };

        const job = await renderQueue.add("render-clip", {
            segmentId: segment.id,
            userId: session.user.id,
            videoId: project.videoId,
            clipMode: true,
            faceTrack: project.faceTrack,
            captionStyle: project.captionStyle,
            subtitleStyle,
            hookOverlay: project.hookOverlay,
            hookText: resolvedHookText,
            hookFontSize: segment.hookFontSize || 64,
            hookFont: segment.hookFont || "Montserrat",
            ctaOverlay: project.ctaOverlay,
            ctaText: project.ctaText,
            editedWords: segment.editedWords || null,
            hookBoxColor: segment.hookBoxColor || "#FFFF00",
            hookFontColor: segment.hookFontColor || "#FFFFFF",
            hookUppercase: segment.hookUppercase !== false,
        });

        jobs.push({
            segmentId: segment.id,
            title: segment.title,
            jobId: job.id,
        });
    }

    await prisma.clipProject.update({
        where: { id },
        data: { clipCount: segments.length },
    });

    console.log(
        `[Clipper] Queued ${segments.length} render jobs for project ${id}`
    );

    return NextResponse.json({
        message: `Rendering ${segments.length} clips`,
        jobs,
    });
}
