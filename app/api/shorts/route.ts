import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET /api/shorts
 * Get all rendered short videos for the current user
 */
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const shorts = await prisma.shortVideo.findMany({
        where: {
            segment: {
                video: { userId: session.user.id },
            },
        },
        include: {
            segment: {
                select: {
                    id: true,
                    title: true,
                    startTime: true,
                    endTime: true,
                    aiScore: true,
                    video: {
                        select: { id: true, title: true },
                    },
                },
            },
        },
        orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(shorts);
}
