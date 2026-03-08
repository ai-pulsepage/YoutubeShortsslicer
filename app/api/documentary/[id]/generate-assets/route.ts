/**
 * Generate Assets API
 * 
 * POST /api/documentary/[id]/generate-assets
 * 
 * Triggers reference image generation for all assets in the asset matrix.
 * Assets are generated via RunPod GPU (Flux.1) and results dispatched via Redis.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateAssetMatrix } from "@/lib/documentary/asset-matrix";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const documentary = await prisma.documentary.findUnique({
        where: { id, userId: session.user.id },
        include: { _count: { select: { assets: true } } },
    });

    if (!documentary) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (documentary.status !== "SCENES_PLANNED" && documentary.status !== "FAILED") {
        return NextResponse.json(
            { error: `Cannot generate assets in status: ${documentary.status}. Must be SCENES_PLANNED.` },
            { status: 400 }
        );
    }

    // Dispatch asset generation jobs
    await generateAssetMatrix(id);

    return NextResponse.json({
        message: "Asset generation started",
        documentaryId: id,
        assetCount: documentary._count.assets,
    });
}
