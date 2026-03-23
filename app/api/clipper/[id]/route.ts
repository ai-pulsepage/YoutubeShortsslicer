import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET /api/clipper/[id] — Get a clip project with all segments and rendered clips
 * DELETE /api/clipper/[id] — Delete a clip project
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

    const project = await prisma.clipProject.findUnique({
        where: { id, userId: session.user.id },
        include: {
            video: {
                include: {
                    transcript: {
                        select: { id: true, segments: true },
                    },
                    segments: {
                        orderBy: { aiScore: "desc" },
                        include: {
                            shortVideo: {
                                select: {
                                    id: true,
                                    storagePath: true,
                                    duration: true,
                                    status: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Compute estimated earnings for rendered clips
    const renderedClips = project.video.segments
        .filter((s) => s.shortVideo?.status === "RENDERED")
        .map((s) => ({
            id: s.id,
            title: s.title,
            description: s.description,
            startTime: s.startTime,
            endTime: s.endTime,
            duration: s.endTime - s.startTime,
            viralScore: s.aiScore,
            hookStrength: s.hookStrength,
            emotionalArc: s.emotionalArc,
            status: s.status,
            hookText: (s as any).hookText,
            editedWords: (s as any).editedWords,
            shortVideo: s.shortVideo,
        }));

    const pendingClips = project.video.segments
        .filter((s) => !s.shortVideo || s.shortVideo.status !== "RENDERED")
        .map((s) => ({
            id: s.id,
            title: s.title,
            description: s.description,
            startTime: s.startTime,
            endTime: s.endTime,
            duration: s.endTime - s.startTime,
            viralScore: s.aiScore,
            hookStrength: s.hookStrength,
            emotionalArc: s.emotionalArc,
            status: s.status,
            hookText: (s as any).hookText,
            editedWords: (s as any).editedWords,
            shortVideo: s.shortVideo,
        }));

    return NextResponse.json({
        ...project,
        renderedClips,
        pendingClips,
        totalClips: project.video.segments.length,
        renderedCount: renderedClips.length,
    });
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    // Verify ownership first
    const existing = await prisma.clipProject.findFirst({
        where: { id, userId: session.user.id },
    });

    if (!existing) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const updateData: Record<string, any> = {};

    // If briefId is provided, fetch brief details and auto-fill fields
    if (body.briefId !== undefined) {
        if (body.briefId) {
            const brief = await prisma.campaignBrief.findFirst({
                where: { id: body.briefId, userId: session.user.id },
            });
            if (!brief) {
                return NextResponse.json({ error: "Campaign brief not found" }, { status: 404 });
            }
            updateData.briefId = brief.id;
            updateData.campaignName = brief.name;
            updateData.campaignCpm = brief.cpmRate;
            updateData.campaignPlatforms = brief.targetPlatforms;
        } else {
            // Unlinking: set briefId to null but keep manual fields
            updateData.briefId = null;
        }
    }

    // Allow manual overrides
    if (body.campaignName !== undefined) updateData.campaignName = body.campaignName;
    if (body.campaignCpm !== undefined) updateData.campaignCpm = body.campaignCpm ? parseFloat(body.campaignCpm) : null;

    const updated = await prisma.clipProject.update({
        where: { id },
        data: updateData,
    });

    return NextResponse.json(updated);
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    await prisma.clipProject.deleteMany({
        where: { id, userId: session.user.id },
    });

    return NextResponse.json({ success: true });
}
