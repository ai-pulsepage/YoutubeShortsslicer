import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name } = await req.json();
    if (!name) return NextResponse.json({ error: "Character name is required" }, { status: 400 });

    try {
        // Find user's children_library project
        const libraryDoc = await prisma.documentary.findFirst({
            where: {
                userId: session.user.id,
                genre: "children_library"
            }
        });

        if (!libraryDoc) {
            return NextResponse.json({ error: "Library project not found" }, { status: 404 });
        }

        // Delete character asset matching label
        const target = await prisma.docAsset.findFirst({
            where: {
                documentaryId: libraryDoc.id,
                label: name
            }
        });

        if (target) {
            await prisma.docAsset.delete({
                where: { id: target.id }
            });
        }

        return NextResponse.json({ success: true });

    } catch (err: any) {
        console.error("[Delete Character Library] Error:", err.message);
        return NextResponse.json({ error: "Failed to delete from library", details: err.message }, { status: 500 });
    }
}
