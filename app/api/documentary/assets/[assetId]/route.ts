/**
 * Asset Management API
 * 
 * PATCH /api/documentary/assets/[assetId] — Approve/reject/swap
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ assetId: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { assetId } = await params;
    const body = await req.json();

    // Verify ownership
    const asset = await prisma.docAsset.findUnique({
        where: { id: assetId },
        include: { documentary: true },
    });

    if (!asset || asset.documentary.userId !== session.user.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const allowedFields = [
        "label", "description", "attire", "imagePath", "prompt",
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
        if (body[field] !== undefined) {
            updateData[field] = body[field];
        }
    }

    // Handle altImages array separately
    if (body.altImages && Array.isArray(body.altImages)) {
        updateData.altImages = body.altImages;
    }

    const updated = await prisma.docAsset.update({
        where: { id: assetId },
        data: updateData,
    });

    return NextResponse.json(updated);
}
