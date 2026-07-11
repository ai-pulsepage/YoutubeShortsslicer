import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const products = await prisma.uGCProduct.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" }
    });
    return NextResponse.json(products);
}
