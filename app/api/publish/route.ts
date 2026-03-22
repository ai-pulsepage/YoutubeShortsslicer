import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET /api/publish - List publish jobs
 * POST /api/publish - Create publish job (schedule or publish now)
 */
export async function GET(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "";
    const channelId = searchParams.get("channel") || "";

    const where: any = {
        shortVideo: { segment: { video: { userId: session.user.id } } },
    };
    if (status) where.status = status;
    if (channelId) where.channelId = channelId;

    const jobs = await prisma.publishJob.findMany({
        where,
        orderBy: { scheduledAt: "asc" },
        include: {
            shortVideo: {
                include: {
                    segment: {
                        select: { title: true, video: { select: { title: true } } },
                    },
                },
            },
            channel: { select: { channelName: true, platform: true } },
        },
    });

    return NextResponse.json(jobs);
}

export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { shortVideoId, channelId, scheduledAt, title, description, hashtags } =
        await req.json();

    if (!shortVideoId || !channelId) {
        return NextResponse.json(
            { error: "shortVideoId and channelId are required" },
            { status: 400 }
        );
    }

    const job = await prisma.publishJob.create({
        data: {
            shortVideoId,
            channelId,
            scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
            status: scheduledAt ? "SCHEDULED" : "DRAFT",
        },
    });

    // Also create a draft post if metadata provided
    if (title || description || hashtags) {
        await prisma.draftPost.create({
            data: {
                shortVideoId,
                channelId,
                title: title || "",
                description: description || "",
                hashtags: Array.isArray(hashtags) ? hashtags : hashtags ? [hashtags] : [],
            },
        });
    }

    return NextResponse.json(job, { status: 201 });
}

export async function PATCH(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId, scheduledAt, title, description } = await req.json();

    if (!jobId) {
        return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    // Verify ownership through shortVideo -> segment -> video -> user chain
    const existing = await prisma.publishJob.findFirst({
        where: {
            id: jobId,
            shortVideo: { segment: { video: { userId: session.user.id } } },
        },
    });

    if (!existing) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const updateData: Record<string, any> = {};
    if (scheduledAt !== undefined) updateData.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;

    const updated = await prisma.publishJob.update({
        where: { id: jobId },
        data: updateData,
    });

    return NextResponse.json(updated);
}

export async function DELETE(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("id");

    if (!jobId) {
        return NextResponse.json({ error: "id query param is required" }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.publishJob.findFirst({
        where: {
            id: jobId,
            shortVideo: { segment: { video: { userId: session.user.id } } },
        },
    });

    if (!existing) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    await prisma.publishJob.delete({ where: { id: jobId } });
    return NextResponse.json({ success: true });
}
