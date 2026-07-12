import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const avatars = await prisma.uGCAvatar.findMany({
            where: { userId: session.user.id, isActive: true },
            orderBy: { createdAt: "desc" }
        });

        const jobs = await prisma.genJob.findMany({
            where: {
                documentary: {
                    userId: session.user.id
                },
                jobType: "ref_image"
            },
            orderBy: { createdAt: "desc" },
            take: 100
        });

        const mapped = avatars.map(avatar => {
            const matchingJob = jobs.find(j => (j.metadata as any)?.ugcAvatarId === avatar.id);
            return {
                ...avatar,
                jobId: matchingJob?.id || null,
                jobStatus: matchingJob?.status || null
            };
        });

        return NextResponse.json(mapped);
    } catch (err: any) {
        console.error("[Get UGC Avatars GET] failed:", err.message);
        return NextResponse.json({ error: "Failed to list avatars" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name, persona, voiceEngine, voiceId } = await req.json();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    try {
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
    } catch (err: any) {
        console.error("[Create UGC Avatar POST] failed:", err.message);
        return NextResponse.json({ error: "Failed to create avatar" }, { status: 500 });
    }
}
