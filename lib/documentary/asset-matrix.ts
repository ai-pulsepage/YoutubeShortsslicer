/**
 * Asset Matrix Manager
 * 
 * Generates image prompts for reference assets and dispatches
 * generation jobs to RunPod via Redis.
 * 
 * Respects visualMode:
 *   - full_ai_video: Generate ALL assets
 *   - chapter_illustrations: Only generate KEY assets (environments + 1 character per scene)
 *   - broll_only / narration_only: Should not be called (gated at route level)
 * 
 * Uses genre-specific imageStyle modifiers for genre-appropriate visual output.
 */

import { prisma } from "@/lib/prisma";
import { CHANNELS, type RedisJob, dispatchJob } from "./redis-client";
import { getImageStyleModifiers } from "./genre-presets";

/**
 * Generates image prompts for assets and dispatches to RunPod
 */
export async function generateAssetMatrix(documentaryId: string): Promise<void> {
    const documentary = await prisma.documentary.findUnique({
        where: { id: documentaryId },
        include: { assets: true },
    });

    if (!documentary) {
        throw new Error(`Documentary ${documentaryId} not found`);
    }

    const visualMode = documentary.visualMode || "broll_only";
    const imageModel = documentary.imageModel || "chroma";
    const genre = documentary.genre || "science";
    const subStyle = documentary.subStyle || "bbc_earth";
    const imageStyleModifiers = getImageStyleModifiers(genre);

    // Filter assets based on visual mode
    let assetsToGenerate = documentary.assets.filter((a) => !a.imagePath);

    if (visualMode === "chapter_illustrations") {
        // Only generate key assets: ENVIRONMENT + CHARACTER (skip FILLER, CONCEPT, excess PROP)
        const environments = assetsToGenerate.filter((a) => a.type === "ENVIRONMENT");
        const characters = assetsToGenerate.filter((a) => a.type === "CHARACTER");
        const keyProps = assetsToGenerate.filter((a) => a.type === "PROP").slice(0, 3); // Max 3 key props

        assetsToGenerate = [...environments, ...characters, ...keyProps];

        console.log(
            `[AssetMatrix] Chapter Illustrations mode: filtered to ${assetsToGenerate.length} key assets ` +
            `(${environments.length} env, ${characters.length} char, ${keyProps.length} props) ` +
            `from ${documentary.assets.length} total`
        );
    }

    let jobCount = 0;

    for (const asset of assetsToGenerate) {
        const prompt = buildAssetPrompt(asset, genre, subStyle, imageStyleModifiers);

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
                    model: imageModel,
                    assetType: asset.type,
                    assetLabel: asset.label,
                    visualMode,
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
                model: imageModel,
                assetId: asset.id,
                assetLabel: asset.label,
            },
        };

        await dispatchJob(redisJob);
        jobCount++;
    }

    console.log(
        `[AssetMatrix] ✅ Dispatched ${jobCount} image generation jobs for "${documentary.title}" ` +
        `(mode: ${visualMode}, model: ${imageModel})`
    );
}

/**
 * Builds a genre-aware image prompt for a reference asset
 * 
 * The imageStyleModifiers inject genre-specific visual aesthetics:
 *   Horror → "desaturated, film grain, deep shadows, found footage"
 *   Children's → "whimsical storybook illustration, bright watercolors"
 *   Nature → "8K photography, shallow DOF, golden hour lighting"
 */
function buildAssetPrompt(
    asset: { type: string; label: string; description: string | null; attire: string | null },
    genre: string,
    subStyle: string,
    imageStyleModifiers: string
): string {
    // Combine genre + substyle for a style label
    const styleLabel = `${genre} ${subStyle}`.replace(/_/g, " ");

    switch (asset.type) {
        case "CHARACTER":
            return [
                `Portrait reference image of ${asset.label}.`,
                asset.description || "",
                asset.attire ? `Wearing: ${asset.attire}.` : "",
                `Visual style: ${imageStyleModifiers}`,
                `Genre: ${styleLabel}. Full face visible, three-quarter view, centered composition.`,
            ]
                .filter(Boolean)
                .join(" ");

        case "PROP":
            return [
                `Product/object reference image: ${asset.label}.`,
                asset.description || "",
                `Visual style: ${imageStyleModifiers}`,
                `Genre: ${styleLabel}. Centered, detailed, sharp focus.`,
            ]
                .filter(Boolean)
                .join(" ");

        case "CONCEPT":
            return [
                `Abstract artistic visualization of: ${asset.label}.`,
                asset.description || "",
                `Visual style: ${imageStyleModifiers}`,
                `Genre: ${styleLabel}. Visually striking, rich detail, cinematic quality.`,
            ]
                .filter(Boolean)
                .join(" ");

        case "ENVIRONMENT":
            return [
                `Wide establishing shot of: ${asset.label}.`,
                asset.description || "",
                `Visual style: ${imageStyleModifiers}`,
                `Genre: ${styleLabel}. Cinematic composition, atmospheric lighting, depth.`,
            ]
                .filter(Boolean)
                .join(" ");

        case "FILLER":
            return [
                `Abstract art for video transition.`,
                asset.description || "Flowing particles, soft colors, dark background.",
                `Visual style: ${imageStyleModifiers}`,
                `Seamless loop texture.`,
            ]
                .filter(Boolean)
                .join(" ");

        default:
            return `${asset.label}: ${asset.description || ""}. Visual style: ${imageStyleModifiers}. Genre: ${styleLabel}.`;
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
