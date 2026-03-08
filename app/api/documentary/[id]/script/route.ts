/**
 * Save Edited Script API
 * 
 * PUT /api/documentary/[id]/script
 * 
 * Saves inline-edited script text back to the documentary.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { script } = body;

    if (!script || typeof script !== "string") {
        return NextResponse.json({ error: "Script text is required" }, { status: 400 });
    }

    const documentary = await prisma.documentary.findUnique({
        where: { id, userId: session.user.id },
    });

    if (!documentary) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.documentary.update({
        where: { id },
        data: { script },
    });

    return NextResponse.json({ success: true });
}
