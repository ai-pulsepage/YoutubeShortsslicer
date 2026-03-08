/**
 * Assemble Documentary API
 *
 * POST /api/documentary/[id]/assemble
 *
 * Triggers the final assembly pipeline: TTS narration + FFmpeg stitching.
 * Requires all video clips to be generated first.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assembleDocumentary, isReadyForAssembly } from "@/lib/documentary/assembler";

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

    // Check readiness
    const readiness = await isReadyForAssembly(id);
    if (!readiness.ready) {
        return NextResponse.json({
            error: "Not ready for assembly",
            totalShots: readiness.totalShots,
            completedShots: readiness.completedShots,
            missingShots: readiness.missingShots,
        }, { status: 400 });
    }

    // Run assembly in background
    assembleDocumentary(id).catch((err) => {
        console.error(`[Assemble API] Pipeline failed for ${id}:`, err);
    });

    return NextResponse.json({
        message: "Assembly started",
        documentaryId: id,
        status: "ASSEMBLING",
    });
}
