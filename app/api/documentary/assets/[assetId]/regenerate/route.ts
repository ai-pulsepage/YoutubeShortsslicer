import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dispatchJob, type RedisJob } from "@/lib/documentary/redis-client";
import { getImageStyleModifiers } from "@/lib/documentary/genre-presets";

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
            documentary: {
                select: {
                    id: true,
                    userId: true,
                    genre: true,
                    subStyle: true,
                    imageModel: true,
                    visualMode: true,
                },
            },
        },
    });

    if (!asset || asset.documentary.userId !== session.user.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const genre = (asset.documentary as any).genre || "science";
    const subStyle = (asset.documentary as any).subStyle || "bbc_earth";
    const imageModel = (asset.documentary as any).imageModel || "chroma";
    const imageStyleModifiers = getImageStyleModifiers(genre);

    // Clear existing image
    await prisma.docAsset.update({
        where: { id: assetId },
        data: { imagePath: null },
    });

    // Build genre-aware prompt
    const styleLabel = `${genre} ${subStyle}`.replace(/_/g, " ");
    const parts = [asset.label];
    if (asset.attire) parts.push(`Wearing: ${asset.attire}.`);
    if (asset.description) parts.push(asset.description);
    parts.push(`Visual style: ${imageStyleModifiers}`);
    parts.push(`Genre: ${styleLabel}.`);
    const prompt = parts.join(" ");

    // Create new job
    const job = await prisma.genJob.create({
        data: {
            documentaryId: asset.documentary.id,
            assetId: assetId,
            jobType: "ref_image",
            prompt,
            status: "QUEUED",
            metadata: {
                width: 1024,
                height: 1024,
                model: imageModel,
                assetType: asset.type,
                assetLabel: asset.label,
            },
        },
    });

    // Dispatch to Redis (persistent list, not pub/sub)
    const redisJob: RedisJob = {
        jobId: job.id,
        documentaryId: asset.documentary.id,
        type: "ref_image",
        prompt,
        referenceImages: [],
        metadata: {
            width: 1024,
            height: 1024,
            model: imageModel,
            assetId: assetId,
            assetLabel: asset.label,
        },
    };

    await dispatchJob(redisJob);

    return NextResponse.json({ jobId: job.id, status: "QUEUED", imageModel });
}
