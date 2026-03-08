import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRedis, CHANNELS } from "@/lib/documentary/redis-client";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ assetId: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { assetId } = await params;

    const asset = await prisma.docAsset.findUnique({
        where: { id: assetId },
        include: {
            documentary: { select: { id: true, userId: true } },
        },
    });

    if (!asset || asset.documentary.userId !== session.user.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Clear existing image
    await prisma.docAsset.update({
        where: { id: assetId },
        data: { imagePath: null },
    });

    // Build the prompt from asset properties
    const parts = [asset.label];
    if (asset.attire) parts.push(asset.attire);
    if (asset.description) parts.push(asset.description);
    const prompt = parts.join(", ");

    // Create new job
    const job = await prisma.genJob.create({
        data: {
            documentaryId: asset.documentary.id,
            assetId: assetId,
            jobType: "ref_image",
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
            type: "image",
            prompt,
            referenceImages: [],
        })
    );

    return NextResponse.json({ jobId: job.id, status: "QUEUED" });
}
