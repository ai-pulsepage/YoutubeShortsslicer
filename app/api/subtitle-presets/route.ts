import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// GET /api/subtitle-presets — return user's subtitle presets
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json([], { status: 200 });
    }

    const presets = await prisma.subtitlePreset.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(presets);
}

// POST /api/subtitle-presets — create a new subtitle preset
export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const preset = await prisma.subtitlePreset.create({
        data: {
            userId: session.user.id,
            name: body.name || "Untitled Preset",
            font: body.font || "Montserrat",
            fontSize: body.fontSize || 28,
            color: body.color || "#FFFFFF",
            outline: body.outline || "#000000",
            shadow: body.shadow || "#00000080",
            position: body.position || "bottom",
            animation: body.animation || "word-highlight",
        },
    });

    return NextResponse.json(preset);
}
