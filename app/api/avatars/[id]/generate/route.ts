import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dispatchJob } from "@/lib/documentary/redis-client";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { id } = await params;
        if (!id) return NextResponse.json({ error: "Missing avatarId" }, { status: 400 });

        const { prompt } = await req.json();
        if (!prompt || !prompt.trim()) {
            return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
        }

        const avatar = await prisma.uGCAvatar.findUnique({
            where: { id, userId: session.user.id }
        });

        if (!avatar) {
            return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
        }

        // Locate or create a private UGC system documentary vault for database tracking
        let ugcVault = await prisma.documentary.findFirst({
            where: { userId: session.user.id, genre: "ugc_vault" }
        });
        if (!ugcVault) {
            ugcVault = await prisma.documentary.create({
                data: {
                    userId: session.user.id,
                    title: "UGC Vault",
                    genre: "ugc_vault",
                    status: "DRAFT"
                }
            });
        }

        // Check if there is already an active (QUEUED or PROCESSING) ref_image job for this avatar
        const activeJob = await prisma.genJob.findFirst({
            where: {
                documentaryId: ugcVault.id,
                jobType: "ref_image",
                status: { in: ["QUEUED", "PROCESSING"] },
                metadata: {
                    path: ["ugcAvatarId"],
                    equals: avatar.id
                }
            }
        });

        if (activeJob) {
            return NextResponse.json({
                success: true,
                jobId: activeJob.id,
                message: "Image generation is already in progress for this avatar."
            });
        }

        // Create a GenJob to track image generation
        const job = await prisma.genJob.create({
            data: {
                documentaryId: ugcVault.id,
                jobType: "ref_image",
                prompt: prompt.trim(),
                status: "QUEUED",
                metadata: { 
                    ugcAvatarId: avatar.id,
                    sourceApp: "AI UGC Studio",
                    title: `Avatar Image Gen: ${avatar.name}`
                } as any
            }
        });

        // Queue job on Redis/RunPod queue
        await dispatchJob({
            jobId: job.id,
            documentaryId: ugcVault.id,
            type: "ref_image",
            prompt: prompt.trim(),
            referenceImages: [],
            metadata: { 
                ugcAvatarId: avatar.id, 
                model: "flux",
                sourceApp: "AI UGC Studio",
                title: `Avatar Image Gen: ${avatar.name}`
            }
        });

        return NextResponse.json({
            success: true,
            jobId: job.id,
            message: "Successfully queued AI image generation for avatar."
        });

    } catch (err: any) {
        console.error("[Avatar Image Generate POST] failed:", err.message);
        return NextResponse.json({ error: "Failed to queue image generation", details: err.message }, { status: 500 });
    }
}
