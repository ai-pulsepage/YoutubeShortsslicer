/**
 * Generate Assets API
 * 
 * POST /api/documentary/[id]/generate-assets
 * 
 * Triggers reference image generation for assets in the asset matrix.
 * Behavior depends on visualMode:
 *   - full_ai_video: Generate ALL assets (reference images for video)
 *   - chapter_illustrations: Generate KEY assets only (~5-10 chapter illustrations)
 *   - broll_only / narration_only: Return 400 — skip this step
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

    // Check status and existing jobs to prevent double-clicks
    const documentary = await prisma.documentary.findUnique({
        where: { id, userId: session.user.id },
        include: {
            _count: { select: { assets: true } },
            genJobs: { where: { status: { in: ["QUEUED", "PROCESSING"] } } },
        },
    });

    if (!documentary) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // ── Visual Mode Gate ──
    const visualMode = documentary.visualMode || "broll_only";

    if (visualMode === "broll_only") {
        return NextResponse.json(
            { error: "Visual mode is 'B-Roll Only' — no AI images needed. Skip to Assembly." },
            { status: 400 }
        );
    }

    if (visualMode === "narration_only") {
        return NextResponse.json(
            { error: "Visual mode is 'Narration Only' — no visuals needed. Skip to Assembly." },
            { status: 400 }
        );
    }

    if (documentary.status !== "SCENES_PLANNED" && documentary.status !== "FAILED") {
        return NextResponse.json(
            { error: `Cannot generate assets in status: ${documentary.status}. Must be SCENES_PLANNED.` },
            { status: 400 }
        );
    }

    // Guard: if there are already queued/processing jobs, don't dispatch again
    if (documentary.genJobs.length > 0) {
        return NextResponse.json(
            { error: `Already has ${documentary.genJobs.length} pending jobs. Wait for them to complete.` },
            { status: 409 }
        );
    }

    // Set status immediately to prevent double-click race condition
    await prisma.documentary.update({
        where: { id },
        data: { status: "GENERATING" },
    });

    // Dispatch asset generation jobs (respects visualMode + imageModel internally)
    await generateAssetMatrix(id);

    return NextResponse.json({
        message: `Asset generation started (${visualMode} mode)`,
        documentaryId: id,
        assetCount: documentary._count.assets,
        visualMode,
    });
}
