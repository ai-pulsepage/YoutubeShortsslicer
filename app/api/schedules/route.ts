import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/schedules — List all schedules for the user
 * POST /api/schedules — Create a new schedule
 * PUT /api/schedules — Update a schedule
 * DELETE /api/schedules?id=xxx — Delete a schedule
 */

export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schedules = await prisma.contentSchedule.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        include: {
            channel: {
                select: {
                    id: true,
                    channelName: true,
                    channelId: true,
                    platform: true,
                    defaults: true,
                },
            },
            _count: {
                select: {
                    publishJobs: true,
                },
            },
        },
    });

    return NextResponse.json(schedules);
}

export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, channelId, description, postTimes, postsPerDay } = await req.json();

    if (!name || !channelId) {
        return NextResponse.json(
            { error: "name and channelId are required" },
            { status: 400 }
        );
    }

    // Verify channel belongs to user
    const channel = await prisma.channel.findFirst({
        where: { id: channelId, userId: session.user.id },
    });

    if (!channel) {
        return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const schedule = await prisma.contentSchedule.create({
        data: {
            userId: session.user.id,
            channelId,
            name,
            description: description || null,
            postTimes: postTimes || ["09:00", "13:00", "18:00"],
            postsPerDay: postsPerDay || 3,
        },
        include: {
            channel: {
                select: { channelName: true, platform: true },
            },
        },
    });

    return NextResponse.json(schedule, { status: 201 });
}

export async function PUT(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, name, description, postTimes, postsPerDay, isActive, channelId } = await req.json();

    if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Verify schedule belongs to user
    const existing = await prisma.contentSchedule.findFirst({
        where: { id, userId: session.user.id },
    });

    if (!existing) {
        return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    const updated = await prisma.contentSchedule.update({
        where: { id },
        data: {
            ...(name !== undefined && { name }),
            ...(description !== undefined && { description }),
            ...(postTimes !== undefined && { postTimes }),
            ...(postsPerDay !== undefined && { postsPerDay }),
            ...(isActive !== undefined && { isActive }),
            ...(channelId !== undefined && { channelId }),
        },
        include: {
            channel: {
                select: { channelName: true, platform: true },
            },
        },
    });

    return NextResponse.json(updated);
}

export async function DELETE(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const existing = await prisma.contentSchedule.findFirst({
        where: { id, userId: session.user.id },
    });

    if (!existing) {
        return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    await prisma.contentSchedule.delete({ where: { id } });

    return NextResponse.json({ deleted: true });
}
