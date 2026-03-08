/**
 * Shot Management API
 * 
 * PATCH /api/documentary/shots/[shotId]         — Edit camera, mood, action
 * POST  /api/documentary/shots/[shotId]/regenerate — Re-generate a specific clip
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ shotId: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { shotId } = await params;
    const body = await req.json();

    // Verify ownership via scene → documentary → user
    const shot = await prisma.docShot.findUnique({
        where: { id: shotId },
        include: { scene: { include: { documentary: true } } },
    });

    if (!shot || shot.scene.documentary.userId !== session.user.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const allowedFields = [
        "shotType", "cameraAngle", "cameraMovement",
        "action", "dialogue", "mood", "lighting", "colorPalette",
        "transitionIn", "transitionOut", "duration",
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
        if (body[field] !== undefined) {
            updateData[field] = body[field];
        }
    }

    const updated = await prisma.docShot.update({
        where: { id: shotId },
        data: updateData,
    });

    return NextResponse.json(updated);
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ shotId: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { shotId } = await params;

    const shot = await prisma.docShot.findUnique({
        where: { id: shotId },
        include: { scene: { include: { documentary: true } } },
    });

    if (!shot || shot.scene.documentary.userId !== session.user.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Delete associated shot-asset records first, then the shot
    await prisma.docShotAsset.deleteMany({ where: { shotId } });
    await prisma.docShot.delete({ where: { id: shotId } });

    return NextResponse.json({ success: true });
}
