import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET /api/channels - List user's connected channels
 * POST /api/channels - Connect a new channel
 * DELETE /api/channels?id=xxx - Disconnect a channel
 */
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const channels = await prisma.channel.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            platform: true,
            channelName: true,
            channelId: true,
            isActive: true,
            createdAt: true,
            _count: { select: { publishJobs: true, channelFlags: true } },
        },
    });

    return NextResponse.json(channels);
}

export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { platform, accessToken, refreshToken, channelName, channelId } =
        await req.json();

    if (!platform || !channelName) {
        return NextResponse.json(
            { error: "Platform and channel name are required" },
            { status: 400 }
        );
    }

    const channel = await prisma.channel.create({
        data: {
            userId: session.user.id,
            platform,
            channelName,
            channelId: channelId || null,
            accessToken: accessToken || null,
            refreshToken: refreshToken || null,
            isActive: true,
        },
    });

    return NextResponse.json(channel, { status: 201 });
}

export async function DELETE(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
        return NextResponse.json({ error: "Channel ID required" }, { status: 400 });
    }

    await prisma.channel.delete({
        where: { id, userId: session.user.id },
    });

    return NextResponse.json({ ok: true });
}
