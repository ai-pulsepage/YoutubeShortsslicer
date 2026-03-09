import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/documentary/[id]/settings
 * Update documentary settings (fillerMode, etc.)
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const body = await req.json();

    const allowedFields = [
        "fillerMode", "voiceId", "ttsEngine", "ttsVoiceId", "narratorStyle",
        "genre", "subStyle", "audience", "perspective", "pacing",
        "ending", "endingNote", "contentMode", "musicMood",
        "useBRoll", "useKenBurns", "useAIVideo",
    ];
    const updateData: Record<string, string> = {};

    for (const field of allowedFields) {
        if (body[field] !== undefined) {
            updateData[field] = body[field];
        }
    }

    if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const doc = await prisma.documentary.update({
        where: { id },
        data: updateData,
    });

    return NextResponse.json({ success: true, fillerMode: doc.fillerMode });
}
