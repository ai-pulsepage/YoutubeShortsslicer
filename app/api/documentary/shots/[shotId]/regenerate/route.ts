import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRedis, CHANNELS } from "@/lib/documentary/redis-client";

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
                    documentary: { select: { id: true, userId: true } },
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
    const referenceImages = shot.shotAssets
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

    // Dispatch to Redis
    const redis = getRedis();
    await redis.publish(
        CHANNELS.DOCUMENTARY_JOBS,
        JSON.stringify({
            jobId: job.id,
            type: "video",
            prompt,
            referenceImages,
            duration: shot.duration || 5,
        })
    );

    return NextResponse.json({ jobId: job.id, status: "QUEUED" });
}
