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

    // Helper: extract words from transcript for a segment's time range
    const transcriptSegments = project.video.transcript?.segments as any[] | undefined;
    function extractWordsForSegment(startTime: number, endTime: number) {
        if (!transcriptSegments || !Array.isArray(transcriptSegments)) return [];
        const words: { text: string; start: number; end: number }[] = [];
        for (const seg of transcriptSegments) {
            // Skip segments outside this clip's range
            if (seg.end < startTime - 0.5 || seg.start > endTime + 0.5) continue;
            if (seg.words && Array.isArray(seg.words) && seg.words.length > 0) {
                for (const w of seg.words) {
                    if (w.start >= startTime - 0.5 && w.end <= endTime + 0.5) {
                        words.push({ text: (w.word || w.text || "").trim(), start: w.start, end: w.end });
                    }
                }
            } else if (seg.text && seg.start !== undefined) {
                const segWords = seg.text.trim().split(/\s+/).filter((w: string) => w.length > 0);
                if (segWords.length > 0) {
                    const segDuration = (seg.end || seg.start + 2) - seg.start;
                    const wordDuration = segDuration / segWords.length;
                    for (let i = 0; i < segWords.length; i++) {
                        const wStart = seg.start + i * wordDuration;
                        const wEnd = seg.start + (i + 1) * wordDuration;
                        if (wStart >= startTime - 0.5 && wEnd <= endTime + 0.5) {
                            words.push({ text: segWords[i], start: wStart, end: wEnd });
                        }
                    }
                }
            }
        }
        return words;
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
            hookText: s.hookText,
            hookFontSize: (s as any).hookFontSize,
            hookFont: (s as any).hookFont,
            editedWords: (s.editedWords && (s.editedWords as any[]).length > 0)
                ? s.editedWords
                : extractWordsForSegment(s.startTime, s.endTime),
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
            hookText: s.hookText,
            hookFontSize: (s as any).hookFontSize,
            hookFont: (s as any).hookFont,
            editedWords: (s.editedWords && (s.editedWords as any[]).length > 0)
                ? s.editedWords
                : extractWordsForSegment(s.startTime, s.endTime),
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
