/**
 * Prompt Engine
 * 
 * Builds composite video generation prompts per shot, combining:
 * - Camera direction (shot type + angle + movement)
 * - Reference images (character + prop + environment)
 * - Action & mood (lighting, color palette)
 * - Continuity seed (last frame from previous shot)
 * - Style guide
 * - Transitions
 * 
 * Dispatches shot_video GenJobs to RunPod via Redis.
 */

import { prisma } from "@/lib/prisma";
import { CHANNELS, type RedisJob, dispatchJob } from "./redis-client";
import { buildKinematicPrompt } from "@/lib/ai/prompt-builder";

/**
 * Generates video prompts for all shots and dispatches to RunPod
 */
export async function generateVideoClips(documentaryId: string): Promise<void> {
    const documentary = await prisma.documentary.findUnique({
        where: { id: documentaryId },
        include: {
            scenes: {
                orderBy: { sceneIndex: "asc" },
                include: {
                    shots: {
                        orderBy: { shotIndex: "asc" },
                        include: {
                            shotAssets: {
                                include: { asset: true },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!documentary) {
        throw new Error(`Documentary ${documentaryId} not found`);
    }

    let jobCount = 0;
    let previousShotLastFrame: string | null = null;

    for (const scene of documentary.scenes) {
        for (const shot of scene.shots) {
            // Skip if already has a clip
            if (shot.clipPath) {
                previousShotLastFrame = shot.lastFramePath || null;
                continue;
            }

            // Build composite prompt
            const prompt = buildShotPrompt(shot, documentary.genre, documentary.subStyle);

            // Gather reference images from assets
            const referenceImages: string[] = [];
            for (const sa of shot.shotAssets) {
                if (sa.asset.imagePath) {
                    referenceImages.push(sa.asset.imagePath);
                }
            }

            // Add previous shot's last frame for continuity (AFTER assets — assets take priority)
            if (previousShotLastFrame) {
                referenceImages.push(previousShotLastFrame);
            }

            // Calculate optimized duration based on dialogue word count (fallback when shot.duration is not set)
            let calculatedDuration = shot.duration || 5;
            if (!shot.duration && shot.dialogue) {
                const wordCount = shot.dialogue.split(/\s+/).filter(Boolean).length;
                calculatedDuration = Math.min(10, Math.max(5, Math.ceil(wordCount / 2.5)));
            }

            // Create GenJob
            const job = await prisma.genJob.create({
                data: {
                    documentaryId,
                    jobType: "shot_video",
                    prompt,
                    referenceImages,
                    shotId: shot.id,
                    status: "QUEUED",
                    metadata: {
                        width: 1280,
                        height: 720,
                        model: "wan2.1",
                        duration: calculatedDuration,
                        sceneIndex: scene.sceneIndex,
                        shotIndex: shot.shotIndex,
                        shotType: shot.shotType,
                        sourceApp: "Documentary Factory",
                        title: documentary.title || "AI Documentary"
                    },
                },
            });

            // Update shot with composite prompt
            await prisma.docShot.update({
                where: { id: shot.id },
                data: { compositePrompt: prompt },
            });

            // Dispatch to Redis queue (LPUSH, not PUB/SUB)
            const redisJob: RedisJob = {
                jobId: job.id,
                documentaryId,
                type: "shot_video",
                prompt,
                referenceImages,
                metadata: {
                    width: 1280,
                    height: 720,
                    duration: calculatedDuration,
                    model: "wan2.1",
                    shotId: shot.id,
                    sourceApp: "Documentary Factory",
                    title: documentary.title || "AI Documentary"
                },
            };

            await dispatchJob(redisJob);
            jobCount++;

            // Track for next shot's continuity
            previousShotLastFrame = null; // Will be set when job completes
        }
    }

    // Update documentary status
    await prisma.documentary.update({
        where: { id: documentaryId },
        data: { status: "GENERATING" },
    });

    console.log(
        `[PromptEngine] ✅ Dispatched ${jobCount} video generation jobs`
    );
}

/**
 * Builds a Wan2.1-optimized composite prompt for a single shot
 */
function buildShotPrompt(
    shot: {
        shotType: string;
        cameraAngle: string | null;
        cameraMovement: string | null;
        action: string | null;
        mood: string | null;
        lighting: string | null;
        colorPalette: string | null;
        transitionIn: string | null;
        transitionOut: string | null;
        shotAssets: Array<{
            role: string | null;
            asset: { label: string; type: string; description: string | null };
        }>;
    },
    genre: string,
    subStyle: string
): string {
    const focusAssets = shot.shotAssets.filter(
        (sa) => sa.role === "focus" || sa.role === "foreground"
    );
    const bgAssets = shot.shotAssets.filter((sa) => sa.role === "background");

    const subjectStr = focusAssets.length > 0
        ? focusAssets.map((sa) => sa.asset.label).join(" and ")
        : "The subject";

    const environmentStr = bgAssets.length > 0
        ? bgAssets.map((sa) => sa.asset.description || sa.asset.label).join(", ")
        : "a cinematic environment";

    const lightingStr = shot.lighting || shot.mood
        ? `${shot.lighting || "soft ambient lighting"}, ${shot.mood || "dramatic"} atmosphere`
        : "soft directional key light";

    return buildKinematicPrompt({
        aspectRatio: "16:9",
        shotType: shot.shotType || "medium shot",
        cameraAngle: shot.cameraAngle || "eye-level",
        cameraMovement: shot.cameraMovement || "gentle push in",
        subject: subjectStr,
        action: shot.action || "gazing forward attentively",
        environment: environmentStr,
        lighting: lightingStr,
        stylePreset: `${genre} ${subStyle}`.replace(/_/g, " ")
    });
}

/**
 * Checks if all video clips are generated
 */
export async function checkClipCompletion(documentaryId: string): Promise<boolean> {
    const pendingJobs = await prisma.genJob.count({
        where: {
            documentaryId,
            jobType: "shot_video",
            status: { in: ["QUEUED", "PROCESSING"] },
        },
    });

    return pendingJobs === 0;
}
