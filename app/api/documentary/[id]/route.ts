/**
 * Documentary Detail API
 * 
 * GET    /api/documentary/[id]  — Full detail: scenes, shots, assets, jobs
 * PATCH  /api/documentary/[id]  — Update title, style, voice, status
 * DELETE /api/documentary/[id]  — Delete project + all assets
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
        "useBRoll", "useKenBurns", "visualMode", "imageModel"];
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

    // Verify ownership
    const existing = await prisma.documentary.findUnique({
        where: { id, userId: session.user.id },
    });

    if (!existing) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Cascade delete handles scenes, shots, assets, jobs
    await prisma.documentary.delete({ where: { id } });

    return NextResponse.json({ success: true });
}
