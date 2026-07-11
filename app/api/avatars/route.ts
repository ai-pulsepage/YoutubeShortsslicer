import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const avatars = await prisma.uGCAvatar.findMany({
        where: { userId: session.user.id, isActive: true },
        orderBy: { createdAt: "desc" }
    });
    return NextResponse.json(avatars);
}

export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name, persona, voiceEngine, voiceId } = await req.json();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const avatar = await prisma.uGCAvatar.create({
        data: {
            userId: session.user.id,
            name,
            persona: persona || null,
            voiceEngine: voiceEngine || "elevenlabs",
            voiceId: voiceId || null
        }
    });
    return NextResponse.json(avatar);
}
