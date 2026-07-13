/**
 * RunPod Result Listener
 *
 * Subscribes to Redis `documentary_results` channel and processes
 * completed/failed generation jobs from the GPU worker.
 *
 * Updates:
 * - GenJob status + outputPath
 * - DocAsset imagePath (for ref images)
 * - DocShot clipPath + lastFramePath (for video clips)
 * - Documentary status when all jobs complete
 *
 * Run: npx tsx lib/documentary/result-listener.ts
 * Or import and call startResultListener() in your app startup.
 */

import { getRedis, CHANNELS } from "./redis-client";
import { prisma } from "@/lib/prisma";
import { organizeCompletedJobAsset } from "./asset-organizer";

interface ResultMessage {
    jobId: string;
    status: "completed" | "failed";
    outputPath?: string;
    lastFramePath?: string;
    error?: string;
    documentaryId: string;
    jobType: string;
    shotId?: string;
    assetId?: string;
    metadata?: any;
}

/**
 * Process a completed or failed result message
 */
async function processResult(result: ResultMessage): Promise<void> {
    const { jobId, status, outputPath, lastFramePath, error } = result;

    console.log(`[ResultListener] Job ${jobId}: ${status}${outputPath ? ` → ${outputPath}` : ""}`);

    // Find the job
    const job = await prisma.genJob.findUnique({ where: { id: jobId } });
    if (!job) {
        console.warn(`[ResultListener] Job ${jobId} not found in DB — skipping`);
        return;
    }

    if (status === "completed" && outputPath) {
        // Automatically organize file path in R2 bucket
        const finalPath = await organizeCompletedJobAsset(jobId, outputPath);

        // Update job as completed
        await prisma.genJob.update({
            where: { id: jobId },
            data: {
                status: "COMPLETED",
                outputPath: finalPath,
            },
        });

        // Update the asset or shot that this job was for
        if (job.assetId && job.jobType === "ref_image") {
            await prisma.docAsset.update({
                where: { id: job.assetId },
                data: { imagePath: finalPath },
            });
            console.log(`[ResultListener]   Asset ${job.assetId} updated with image`);
        }

        // Check if this job was for a UGC avatar
        const meta = job.metadata as any;
        if (meta && meta.ugcAvatarId) {
            await prisma.uGCAvatar.update({
                where: { id: meta.ugcAvatarId },
                data: { referenceImageUrl: finalPath },
            });
            console.log(`[ResultListener]   UGC Avatar ${meta.ugcAvatarId} updated with image path`);
        }

        // Check if this job was for an Animated Short Scene/Shot
        if (meta && (meta.sceneId || meta.shotId)) {
            const sceneId = meta.sceneId;
            const shotId = meta.shotId;
            let targetScene = null;

            if (sceneId) {
                targetScene = await prisma.docScene.findUnique({ where: { id: sceneId } });
            } else if (shotId) {
                targetScene = await prisma.docScene.findFirst({
                    where: { searchQueries: { contains: shotId } }
                });
            }

            if (targetScene) {
                let updatedPath = finalPath;
                let searchQueriesMeta: any = {};
                try {
                    searchQueriesMeta = JSON.parse(targetScene.searchQueries || "{}");
                } catch {}

                if (searchQueriesMeta.visualShots && Array.isArray(searchQueriesMeta.visualShots)) {
                    searchQueriesMeta.visualShots = searchQueriesMeta.visualShots.map((shot: any) => {
                        if ((shotId && shot.id === shotId) || shot.jobId === jobId) {
                            return { ...shot, visualPath: finalPath, jobStatus: "COMPLETED" };
                        }
                        return shot;
                    });

                    const allDone = searchQueriesMeta.visualShots.every((s: any) => s.jobStatus === "COMPLETED" || s.visualPath);
                    if (allDone && searchQueriesMeta.visualShots.length > 0) {
                        updatedPath = searchQueriesMeta.visualShots[searchQueriesMeta.visualShots.length - 1].visualPath || finalPath;
                    }
                }

                await prisma.docScene.update({
                    where: { id: targetScene.id },
                    data: {
                        assembledPath: updatedPath,
                        searchQueries: JSON.stringify(searchQueriesMeta)
                    }
                });
            }
        }

        if (job.shotId && job.jobType === "shot_video") {
            const updateData: Record<string, string> = { clipPath: finalPath };
            if (lastFramePath) updateData.lastFramePath = lastFramePath;

            await prisma.docShot.update({
                where: { id: job.shotId },
                data: updateData,
            });
            console.log(`[ResultListener]   Shot ${job.shotId} updated with clip`);
        }

        // Check if all jobs for this documentary are done
        await checkDocumentaryCompletion(job.documentaryId);

    } else if (status === "failed") {
        await prisma.genJob.update({
            where: { id: jobId },
            data: {
                status: "FAILED",
                errorMsg: error || "Unknown GPU worker error",
            },
        });
        console.error(`[ResultListener]   Job ${jobId} FAILED: ${error}`);
    }
}

/**
 * Check if all jobs for a documentary are complete
 * and advance the documentary status accordingly
 */
async function checkDocumentaryCompletion(documentaryId: string): Promise<void> {
    const jobs = await prisma.genJob.findMany({
        where: { documentaryId },
        select: { status: true, jobType: true },
    });

    const allDone = jobs.every((j: { status: string }) => j.status === "COMPLETED" || j.status === "FAILED");
    if (!allDone) return;

    const doc = await prisma.documentary.findUnique({
        where: { id: documentaryId },
        select: { status: true },
    });
    if (!doc) return;

    // Determine what was completed
    const refImageJobs = jobs.filter((j: { jobType: string }) => j.jobType === "ref_image");
    const videoJobs = jobs.filter((j: { jobType: string }) => j.jobType === "shot_video");
    const refImagesDone = refImageJobs.every((j: { status: string }) => j.status === "COMPLETED");
    const videosDone = videoJobs.every((j: { status: string }) => j.status === "COMPLETED");

    let newStatus: string | null = null;

    if (doc.status === "GENERATING" && refImageJobs.length > 0 && refImagesDone && videoJobs.length === 0) {
        // All ref images done, no video jobs yet → assets ready
        newStatus = "ASSETS_READY";
    } else if (doc.status === "GENERATING" && videoJobs.length > 0 && videosDone) {
        // All video clips generated → ready for assembly
        newStatus = "ASSETS_READY"; // stays here until assembly is triggered
    }

    if (newStatus) {
        await prisma.documentary.update({
            where: { id: documentaryId },
            data: { status: newStatus as any },
        });
        console.log(`[ResultListener] Documentary ${documentaryId} → ${newStatus}`);
    }
}

/**
 * Start the result listener (runs indefinitely)
 */
export async function startResultListener(): Promise<void> {
    console.log("[ResultListener] Starting Redis subscription...");

    const redis = getRedis();
    // Create a duplicate connection for subscribing (ioredis pattern)
    const sub = redis.duplicate();

    sub.subscribe(CHANNELS.DOCUMENTARY_RESULTS, (err) => {
        if (err) {
            console.error("[ResultListener] Subscribe error:", err.message);
            return;
        }
        console.log(`[ResultListener] ✅ Listening on channel: ${CHANNELS.DOCUMENTARY_RESULTS}`);
    });

    sub.on("message", async (_channel: string, message: string) => {
        try {
            const result: ResultMessage = JSON.parse(message);
            await processResult(result);
        } catch (err: any) {
            console.error("[ResultListener] Error processing message:", err.message);
        }
    });
}
