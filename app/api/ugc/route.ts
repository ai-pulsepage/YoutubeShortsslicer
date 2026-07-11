import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const jobs = await prisma.uGCJob.findMany({
        where: { userId: session.user.id },
        include: { 
            avatar: { select: { name: true } }, 
            product: { select: { name: true } } 
        },
        orderBy: { createdAt: "desc" },
        take: 20,
    });
    return NextResponse.json(jobs);
}
