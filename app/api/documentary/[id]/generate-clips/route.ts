/**
 * Generate Clips API
 * 
 * POST /api/documentary/[id]/generate-clips
 * 
 * Triggers video clip generation for all shots via RunPod GPU (Wan2.1).
 * Each shot gets a composite prompt with reference images for consistency.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateVideoClips } from "@/lib/documentary/prompt-engine";

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
    });

    if (!documentary) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (documentary.status !== "ASSETS_READY" && documentary.status !== "FAILED") {
        return NextResponse.json(
            { error: `Cannot generate clips in status: ${documentary.status}. Must be ASSETS_READY.` },
            { status: 400 }
        );
    }

    await generateVideoClips(id);

    return NextResponse.json({
        message: "Video clip generation started",
        documentaryId: id,
    });
}
