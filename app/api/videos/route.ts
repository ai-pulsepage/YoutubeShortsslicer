import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const tagId = searchParams.get("tag") || "";
    const sort = searchParams.get("sort") || "newest";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: any = { userId: session.user.id };

    if (search) {
        where.OR = [
            { title: { contains: search, mode: "insensitive" } },
            { sourceUrl: { contains: search, mode: "insensitive" } },
        ];
    }

    if (status && status !== "all") {
        where.status = status.toUpperCase();
    }

    if (tagId) {
        where.videoTags = { some: { tagId } };
    }

    const orderBy: any =
        sort === "oldest"
            ? { createdAt: "asc" }
            : sort === "title"
                ? { title: "asc" }
                : sort === "duration"
                    ? { duration: "desc" }
                    : { createdAt: "desc" };

    const [videos, total] = await Promise.all([
        prisma.video.findMany({
            where,
            orderBy,
            skip: (page - 1) * limit,
            take: limit,
            include: {
                videoTags: { include: { tag: true } },
                _count: { select: { segments: true } },
            },
        }),
        prisma.video.count({ where }),
    ]);

    return NextResponse.json({
        videos,
        total,
        page,
        totalPages: Math.ceil(total / limit),
    });
}
