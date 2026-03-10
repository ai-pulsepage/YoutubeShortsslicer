/**
 * Documentary Detail API
 * 
 * GET    /api/documentary/[id]  — Full detail: scenes, shots, assets, jobs
 * PATCH  /api/documentary/[id]  — Update title, style, voice, status
 * DELETE /api/documentary/[id]  — Delete project + all assets + R2 files
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteMultipleFromR2 } from "@/lib/storage";

export async function GET(
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
        include: {
            scenes: {
                orderBy: { sceneIndex: "asc" },
                include: {
                    shots: {
                        orderBy: { shotIndex: "asc" },
                        include: {
                            shotAssets: {
                                include: { asset: true },
                            },
                        },
                    },
                },
            },
            assets: {
                orderBy: { type: "asc" },
            },
            genJobs: {
                orderBy: { createdAt: "desc" },
            },
        },
    });

    if (!documentary) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(documentary);
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    // Verify ownership
    const existing = await prisma.documentary.findUnique({
        where: { id, userId: session.user.id },
    });

    if (!existing) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const allowedFields = ["title", "voiceId", "status", "script",
        "genre", "subStyle", "audience", "perspective", "pacing",
        "ending", "endingNote", "contentMode", "musicMood",
        "useBRoll", "useKenBurns", "visualMode", "imageModel",
        "ttsEngine", "narratorStyle", "ttsVoiceId", "fillerMode"];
    const updateData: Record<string, unknown> = {};

    for (const field of allowedFields) {
        if (body[field] !== undefined) {
            updateData[field] = body[field];
        }
    }

    const updated = await prisma.documentary.update({
        where: { id },
        data: updateData,
    });

    return NextResponse.json(updated);
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership and collect all R2 paths
    const existing = await prisma.documentary.findUnique({
        where: { id, userId: session.user.id },
        include: {
            assets: { select: { imagePath: true } },
            genJobs: { select: { outputPath: true } },
            scenes: {
                include: {
                    shots: { select: { clipPath: true, lastFramePath: true } },
                },
            },
        },
    });

    if (!existing) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Collect all R2 keys to delete
    const r2Keys: string[] = [];

    for (const asset of existing.assets) {
        if (asset.imagePath) r2Keys.push(asset.imagePath);
    }
    for (const job of existing.genJobs) {
        if (job.outputPath) r2Keys.push(job.outputPath);
    }
    for (const scene of existing.scenes) {
        for (const shot of scene.shots) {
            if (shot.clipPath) r2Keys.push(shot.clipPath);
            if (shot.lastFramePath) r2Keys.push(shot.lastFramePath);
        }
    }
    if (existing.finalVideoPath) r2Keys.push(existing.finalVideoPath);

    // Deduplicate and filter out full URLs (only delete R2 keys)
    const uniqueKeys = [...new Set(r2Keys)].filter(k => !k.startsWith("http"));

    // Delete R2 files (non-blocking — don't fail the delete if R2 cleanup fails)
    if (uniqueKeys.length > 0) {
        try {
            const deleted = await deleteMultipleFromR2(uniqueKeys);
            console.log(`[Delete] Cleaned ${deleted} R2 objects for documentary ${id}`);
        } catch (err) {
            console.error(`[Delete] R2 cleanup failed for ${id}:`, err);
        }
    }

    // Cascade delete handles scenes, shots, assets, jobs
    await prisma.documentary.delete({ where: { id } });

    return NextResponse.json({ success: true, r2Cleaned: uniqueKeys.length });
}
