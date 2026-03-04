import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tags = await prisma.tag.findMany({
        where: { userId: session.user.id },
        orderBy: { name: "asc" },
        include: { _count: { select: { videoTags: true } } },
    });

    return NextResponse.json(tags);
}

export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, color } = await req.json();
    if (!name?.trim()) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const tag = await prisma.tag.create({
        data: {
            name: name.trim(),
            color: color || "#3B82F6",
            userId: session.user.id,
        },
    });

    return NextResponse.json(tag, { status: 201 });
}

export async function DELETE(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
        return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    await prisma.tag.delete({
        where: { id, userId: session.user.id },
    });

    return NextResponse.json({ ok: true });
}
