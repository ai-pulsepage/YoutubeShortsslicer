import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { shotId, speakerName, dialogueLine, actionDescription, kinematicPrompt } = body;

        if (!shotId) {
            return NextResponse.json({ error: "Missing shotId" }, { status: 400 });
        }

        const updatedShot = await prisma.docShot.update({
            where: { id: shotId },
            data: {
                ...(dialogueLine !== undefined && { dialogue: dialogueLine }),
                ...(actionDescription !== undefined && { action: actionDescription }),
                ...(kinematicPrompt !== undefined && { compositePrompt: kinematicPrompt }),
            }
        });

        return NextResponse.json({ success: true, shot: updatedShot });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || "Failed to update shot" }, { status: 500 });
    }
}
