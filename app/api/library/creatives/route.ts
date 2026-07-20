import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const url = new URL(req.url);
        const tab = url.searchParams.get("tab") || "sources";

        if (tab === "documentaries") {
            // Get all stories/documentaries except kids animation
            const data = await prisma.documentary.findMany({
                where: {
                    userId: session.user.id,
                    genre: { not: "children" },
                },
                select: {
                    id: true,
                    title: true,
                    status: true,
                    genre: true,
                    subStyle: true,
                    finalVideoPath: true,
                    createdAt: true,
                },
                orderBy: { createdAt: "desc" },
            });
            return NextResponse.json({ success: true, data });
        }

        if (tab === "kids") {
            // Get all kids animated studio projects (genre === 'children')
            const data = await prisma.documentary.findMany({
                where: {
                    userId: session.user.id,
                    genre: "children",
                },
                select: {
                    id: true,
                    title: true,
                    status: true,
                    genre: true,
                    subStyle: true,
                    finalVideoPath: true,
                    createdAt: true,
                },
                orderBy: { createdAt: "desc" },
            });
            return NextResponse.json({ success: true, data });
        }

        if (tab === "ugc") {
            // Get all generated UGC ads
            const data = await prisma.uGCJob.findMany({
                where: {
                    userId: session.user.id,
                    status: "DONE",
                },
                include: {
                    product: { select: { name: true, price: true } },
                    avatar: { select: { name: true, persona: true } },
                    campaign: { select: { name: true } },
                },
                orderBy: { createdAt: "desc" },
            });
            return NextResponse.json({ success: true, data });
        }

        if (tab === "podcasts") {
            // Get all finished podcast episodes
            const data = await prisma.podcastEpisode.findMany({
                where: {
                    show: { userId: session.user.id },
                    status: "READY",
                },
                include: {
                    show: { select: { name: true } },
                },
                orderBy: { createdAt: "desc" },
            });
            return NextResponse.json({ success: true, data });
        }

        if (tab === "shorts") {
            // Get all completed sliced short videos
            const data = await prisma.shortVideo.findMany({
                where: {
                    status: "RENDERED",
                    segment: { video: { userId: session.user.id } },
                },
                include: {
                    segment: {
                        select: {
                            title: true,
                            video: { select: { title: true } }
                        }
                    }
                },
                orderBy: { createdAt: "desc" },
            });
            return NextResponse.json({ success: true, data });
        }

        // Default or fallthrough fallback (empty)
        return NextResponse.json({ success: true, data: [] });
    } catch (err: any) {
        console.error("[Creative Aggregation API] failed:", err.message);
        return NextResponse.json({ error: "Failed to aggregate creatives", details: err.message }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id, tab, status } = await req.json();
        if (!id || !status) {
            return NextResponse.json({ error: "id and status are required" }, { status: 400 });
        }

        const dbStatus = status === "COMPLETED" ? "APPROVED" : "DRAFT";

        if (tab === "kids" || tab === "documentaries") {
            await prisma.documentary.update({
                where: { id, userId: session.user.id },
                data: { status: dbStatus }
            });
        } else if (tab === "ugc") {
            await prisma.uGCJob.update({
                where: { id, userId: session.user.id },
                data: { status: status === "COMPLETED" ? "DONE" : "FAILED" }
            });
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: "Failed to update status", details: err.message }, { status: 500 });
    }
}
