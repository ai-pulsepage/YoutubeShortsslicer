import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { id } = await params;
        if (!id) return NextResponse.json({ error: "Missing avatarId" }, { status: 400 });

        const body = await req.json();
        const { name, persona, voiceEngine, voiceId, referenceImageUrl } = body;

        const updated = await prisma.uGCAvatar.update({
            where: { id, userId: session.user.id },
            data: {
                ...(name !== undefined && { name }),
                ...(persona !== undefined && { persona }),
                ...(voiceEngine !== undefined && { voiceEngine }),
                ...(voiceId !== undefined && { voiceId }),
                ...(referenceImageUrl !== undefined && { referenceImageUrl })
            }
        });

        return NextResponse.json(updated);
    } catch (err: any) {
        console.error("[Avatar PATCH] failed:", err.message);
        return NextResponse.json({ error: "Failed to update avatar", details: err.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { id } = await params;
        if (!id) return NextResponse.json({ error: "Missing avatarId" }, { status: 400 });

        // Soft delete by setting isActive to false
        await prisma.uGCAvatar.update({
            where: { id, userId: session.user.id },
            data: { isActive: false }
        });

        return NextResponse.json({ success: true, message: "Successfully deleted avatar profile" });
    } catch (err: any) {
        console.error("[Avatar DELETE] failed:", err.message);
        return NextResponse.json({ error: "Failed to delete avatar", details: err.message }, { status: 500 });
    }
}
