import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";

/**
 * POST /api/clipper/[id]/render — Render specific segments as polished clips
 * Body: { segmentIds: string[] } or { all: true } for all ≥7 score segments
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
    const { segmentIds, all, subtitleStyle, hookFontSize: bodyHookFontSize, hookFont: bodyHookFont, hookBoxColor, hookFontColor } = body;

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
        // Render all segments with viral score ≥ 7 (including already rendered for re-render)
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

    // Queue render jobs with clip studio options
    const renderQueue = getQueue(QUEUE_NAMES.RENDER);
    const jobs = [];

    for (const segment of segments) {
        // Mark segment as rendering
        await prisma.segment.update({
            where: { id: segment.id },
            data: { status: "RENDERING" },
        });

        // Auto-generate hookText: user edit > campaign suggestion + clip title
        let resolvedHookText = (segment as any).hookText || null;
        if (!resolvedHookText && onScreenSuggestions.length > 0) {
            const suggestion = onScreenSuggestions[Math.floor(Math.random() * onScreenSuggestions.length)];
            resolvedHookText = [suggestion, segment.title].filter(Boolean).join(" ");
        }

        const job = await renderQueue.add("render-clip", {
            segmentId: segment.id,
            userId: session.user.id,
            videoId: project.videoId,
            // Clip Studio options
            clipMode: true,
            faceTrack: project.faceTrack,
            captionStyle: project.captionStyle,
            subtitleStyle: subtitleStyle || null,
            hookOverlay: project.hookOverlay,
            hookText: resolvedHookText,
            hookFontSize: bodyHookFontSize || (segment as any).hookFontSize || null,
            hookFont: bodyHookFont || (segment as any).hookFont || null,
            ctaOverlay: project.ctaOverlay,
            ctaText: project.ctaText,
            editedWords: (segment as any).editedWords || null,
            hookBoxColor: hookBoxColor || null,
            hookFontColor: hookFontColor || null,
        });

        jobs.push({
            segmentId: segment.id,
            title: segment.title,
            jobId: job.id,
        });
    }

    // Update clip count
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
