import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dispatchJob, type RedisJob } from "@/lib/documentary/redis-client";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ shotId: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { shotId } = await params;

    const shot = await prisma.docShot.findUnique({
        where: { id: shotId },
        include: {
            scene: {
                include: {
                    documentary: { select: { id: true, userId: true, style: true } },
                },
            },
            shotAssets: {
                include: { asset: { select: { imagePath: true } } },
            },
        },
    });

    if (!shot || shot.scene.documentary.userId !== session.user.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Clear existing clip
    await prisma.docShot.update({
        where: { id: shotId },
        data: { clipPath: null, lastFramePath: null },
    });

    // Get reference images from shot assets
    const referenceImages: string[] = shot.shotAssets
        .map((sa: any) => sa.asset?.imagePath)
        .filter(Boolean);

    // Build the prompt
    const prompt = `${shot.shotType} shot, ${shot.cameraAngle || "eye level"}, ${shot.cameraMovement || "static"}: ${shot.action || ""}. Mood: ${shot.mood || "neutral"}. Lighting: ${shot.lighting || "natural"}`;

    // Create new generation job
    const job = await prisma.genJob.create({
        data: {
            documentaryId: shot.scene.documentary.id,
            shotId: shotId,
            jobType: "shot_video",
            prompt,
            status: "QUEUED",
        },
    });

    // Dispatch to Redis queue via LPUSH (not PUB/SUB)
    const redisJob: RedisJob = {
        jobId: job.id,
        documentaryId: shot.scene.documentary.id,
        type: "shot_video",
        prompt,
        referenceImages,
        metadata: {
            width: 1280,
            height: 720,
            duration: shot.duration || 5,
            model: "wan2.1",
            shotId: shot.id,
        },
    };

    await dispatchJob(redisJob);

    return NextResponse.json({ jobId: job.id, status: "QUEUED" });
}

