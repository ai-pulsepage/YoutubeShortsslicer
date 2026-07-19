import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing product ID" }, { status: 400 });

    try {
        // First delete associated UGC jobs
        await prisma.uGCJob.deleteMany({
            where: { productId: id, userId: session.user.id }
        });

        // Delete product campaign
        await prisma.uGCProduct.delete({
            where: { id, userId: session.user.id }
        });

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("[Product Delete] Error:", err.message);
        return NextResponse.json({ error: "Failed to delete product campaign" }, { status: 500 });
    }
}
