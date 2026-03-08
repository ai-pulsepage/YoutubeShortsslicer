/**
 * Asset Matrix Manager
 * 
 * Generates image prompts for reference assets and dispatches
 * generation jobs to RunPod via Redis.
 */

import { prisma } from "@/lib/prisma";
import { CHANNELS, type RedisJob, dispatchJob } from "./redis-client";

/**
 * Generates image prompts for all assets and dispatches to RunPod
 */
export async function generateAssetMatrix(documentaryId: string): Promise<void> {
    const documentary = await prisma.documentary.findUnique({
        where: { id: documentaryId },
        include: { assets: true },
    });

    if (!documentary) {
        throw new Error(`Documentary ${documentaryId} not found`);
    }

    let jobCount = 0;

    for (const asset of documentary.assets) {
        // Skip if already has an image
        if (asset.imagePath) continue;

        const prompt = buildAssetPrompt(asset, documentary.style, documentary.styleGuide);

        // Create GenJob in DB
        const job = await prisma.genJob.create({
            data: {
                documentaryId,
                jobType: "ref_image",
                prompt,
                assetId: asset.id,
                status: "QUEUED",
                metadata: {
                    width: 1024,
                    height: 1024,
                    model: "flux-1-dev",
                    assetType: asset.type,
                    assetLabel: asset.label,
                },
            },
        });

        // Dispatch to Redis
        const redisJob: RedisJob = {
            jobId: job.id,
            documentaryId,
            type: "ref_image",
            prompt,
            referenceImages: [],
            metadata: {
                width: 1024,
                height: 1024,
                model: "flux-1-dev",
                assetId: asset.id,
                assetLabel: asset.label,
            },
        };

        await dispatchJob(redisJob);
        jobCount++;
    }

    console.log(
        `[AssetMatrix] ✅ Dispatched ${jobCount} image generation jobs for "${documentary.title}"`
    );
}

/**
 * Builds a Flux.1-optimized prompt for a reference asset image
 */
function buildAssetPrompt(
    asset: { type: string; label: string; description: string | null; attire: string | null },
    style: string,
    styleGuide: unknown
): string {
    const sg = (styleGuide as Record<string, string>) || {};
    const palette = sg.colorPalette || "rich, cinematic colors";
    const era = sg.era || "modern";

    switch (asset.type) {
        case "CHARACTER":
            return [
                `Portrait reference image of ${asset.label}.`,
                asset.description || "",
                asset.attire ? `Wearing: ${asset.attire}.` : "",
                `Style: ${style}, ${era}, photorealistic.`,
                `Color palette: ${palette}.`,
                `Clean background, centered composition, professional lighting.`,
                `Full face visible, three-quarter view.`,
            ]
                .filter(Boolean)
                .join(" ");

        case "PROP":
            return [
                `Product/object reference image: ${asset.label}.`,
                asset.description || "",
                `Style: ${style}, ${era}.`,
                `Clean background, centered, studio lighting.`,
                `High detail, sharp focus.`,
            ]
                .filter(Boolean)
                .join(" ");

        case "CONCEPT":
            return [
                `Abstract artistic visualization of: ${asset.label}.`,
                asset.description || "",
                `Style: ${style}, artistic interpretation, visually striking.`,
                `Color palette: ${palette}.`,
                `Dark background, rich detail, cinematic quality.`,
            ]
                .filter(Boolean)
                .join(" ");

        case "ENVIRONMENT":
            return [
                `Wide establishing shot of: ${asset.label}.`,
                asset.description || "",
                `Style: ${style}, ${era}, photorealistic.`,
                `Color palette: ${palette}.`,
                `Cinematic composition, atmospheric lighting, depth.`,
            ]
                .filter(Boolean)
                .join(" ");

        case "FILLER":
            return [
                `Abstract art for video transition.`,
                asset.description || "Flowing particles, soft colors, dark background.",
                `Style: abstract, meditative, calming.`,
                `Color palette: ${palette}.`,
                `Seamless loop texture, dark background.`,
            ]
                .filter(Boolean)
                .join(" ");

        default:
            return `${asset.label}: ${asset.description || ""}. Style: ${style}.`;
    }
}

/**
 * Checks if all reference images are generated for a documentary
 */
export async function checkAssetCompletion(documentaryId: string): Promise<boolean> {
    const pendingJobs = await prisma.genJob.count({
        where: {
            documentaryId,
            jobType: "ref_image",
            status: { in: ["QUEUED", "PROCESSING"] },
        },
    });

    if (pendingJobs === 0) {
        // Update documentary status
        await prisma.documentary.update({
            where: { id: documentaryId },
            data: { status: "ASSETS_READY" },
        });
        return true;
    }

    return false;
}
