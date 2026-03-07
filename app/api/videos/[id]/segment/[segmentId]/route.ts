import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * PATCH /api/videos/[id]/segment/[segmentId]
 * Update a segment's status, title, or voiceover toggle
 */
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string; segmentId: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, segmentId } = await params;

    // Verify ownership
    const video = await prisma.video.findFirst({
        where: { id, userId: session.user.id },
    });

    if (!video) {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const body = await req.json();
    const allowedFields: Record<string, any> = {};

    if (body.status && ["APPROVED", "REJECTED", "AI_SUGGESTED", "RENDERED"].includes(body.status)) {
        allowedFields.status = body.status;
    }
    if (typeof body.title === "string") {
        allowedFields.title = body.title;
    }
    if (typeof body.voiceoverEnabled === "boolean") {
        allowedFields.voiceoverEnabled = body.voiceoverEnabled;
    }
    if (typeof body.startTime === "number") {
        allowedFields.startTime = body.startTime;
    }
    if (typeof body.endTime === "number") {
        allowedFields.endTime = body.endTime;
    }
    if (typeof body.voiceoverText === "string") {
        allowedFields.voiceoverText = body.voiceoverText;
    }
    if (typeof body.voiceoverVoice === "string") {
        allowedFields.voiceoverVoice = body.voiceoverVoice;
    }
    if (typeof body.voiceoverMixMode === "string" && ["replace", "mix", "original"].includes(body.voiceoverMixMode)) {
        allowedFields.voiceoverMixMode = body.voiceoverMixMode;
    }

    if (Object.keys(allowedFields).length === 0) {
        return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await prisma.segment.update({
        where: { id: segmentId },
        data: allowedFields,
    });

    return NextResponse.json(updated);
}
