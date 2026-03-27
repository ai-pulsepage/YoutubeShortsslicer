import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * POST /api/clipper/[id]/apply-defaults
 * Bulk-update style settings on selected segments (or all if no segmentIds specified).
 * Body: { segmentIds?: string[], settings: { subFont, subFontSize, ... } }
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
    const { segmentIds, settings } = body;

    if (!settings || typeof settings !== "object") {
        return NextResponse.json({ error: "Settings object is required" }, { status: 400 });
    }

    // Verify project ownership
    const project = await prisma.clipProject.findFirst({
        where: { id, userId: session.user.id },
        include: { video: { select: { id: true } } },
    });

    if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Build update data from allowed fields only
    const allowedFields = [
        "subAnimation", "subFont", "subPosition", "subColor", "subFontSize", "subHighlightColor",
        "hookBoxColor", "hookFontColor", "hookUppercase",
        "hookFont", "hookFontSize",
    ];
    const updateData: Record<string, any> = {};
    for (const field of allowedFields) {
        if (settings[field] !== undefined) {
            updateData[field] = settings[field];
        }
    }

    if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: "No valid settings provided" }, { status: 400 });
    }

    // Build where clause — either selected segments or all segments in this project's video
    const where: any = { videoId: project.videoId };
    if (segmentIds && Array.isArray(segmentIds) && segmentIds.length > 0) {
        where.id = { in: segmentIds };
    }

    const result = await prisma.segment.updateMany({
        where,
        data: updateData,
    });

    return NextResponse.json({
        success: true,
        updated: result.count,
        settings: updateData,
    });
}
