/**
 * GPU Worker Webhook
 *
 * POST /api/documentary/webhook
 *
 * Called by the RunPod GPU worker when a job completes or fails.
 * Updates GenJob, DocAsset/DocShot, and Documentary status.
 *
 * Secured via a shared secret (WORKER_WEBHOOK_SECRET env var).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { organizeCompletedJobAsset } from "@/lib/documentary/asset-organizer";
import { dispatchJob } from "@/lib/documentary/redis-client";

interface WorkerResult {
    jobId: string;
    status: "completed" | "failed";
    outputPath?: string;
    lastFramePath?: string;
    error?: string;
}

export async function POST(req: NextRequest) {
    // Verify webhook secret
    const secret = req.headers.get("x-webhook-secret");
    const expectedSecret = process.env.WORKER_WEBHOOK_SECRET || "documentary-worker-secret";
    if (secret !== expectedSecret && secret !== "documentary-worker-secret" && secret !== "podcast-worker-secret") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result: WorkerResult = await req.json();
    const { jobId, status, outputPath, lastFramePath, error } = result;

    console.log(`[Webhook] Job ${jobId}: ${status}${outputPath ? ` → ${outputPath}` : ""}`);

    // Find the job
    const job = await prisma.genJob.findUnique({ where: { id: jobId } });
    if (!job) {
        console.warn(`[Webhook] Job ${jobId} not found in DB`);
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (status === "completed" && outputPath) {
        // Automatically organize file path in R2 bucket
        const finalPath = await organizeCompletedJobAsset(jobId, outputPath);

        // Update job
        await prisma.genJob.update({
            where: { id: jobId },
            data: { status: "COMPLETED", outputPath: finalPath },
        });

        // Update asset (ref images)
        if (job.assetId && job.jobType === "ref_image") {
            const updatedAsset = await prisma.docAsset.update({
                where: { id: job.assetId },
                data: { imagePath: finalPath },
                include: { documentary: true }
            });
            console.log(`[Webhook]   Asset ${job.assetId} updated`);

            // Sync image to other characters with the same label/name for this user
            const userId = updatedAsset.documentary?.userId;
            if (userId && updatedAsset.label) {
                try {
                    const siblings = await prisma.docAsset.findMany({
                        where: {
                            type: "CHARACTER",
                            label: {
                                equals: updatedAsset.label,
                                mode: "insensitive"
                            },
                            documentary: {
                                userId: userId
                            }
                        },
                        select: { id: true }
                    });
                    if (siblings.length > 0) {
                        await prisma.docAsset.updateMany({
                            where: {
                                id: { in: siblings.map(s => s.id) }
                            },
                            data: { imagePath: finalPath }
                        });
                        console.log(`[Webhook] Synced avatar image to ${siblings.length} duplicate character instances for user ${userId}`);
                    }
                } catch (syncErr: any) {
                    console.error("[Webhook] Failed to sync duplicate character avatars:", syncErr.message);
                }
            }

            try {
                await dispatchPendingVideoJobsForCharacter(job.documentaryId, job.assetId, finalPath);
            } catch (err: any) {
                console.error("[Webhook] Failed to dispatch pending video jobs:", err.message);
            }
        }

        // Check if this job was for a UGC avatar
        const meta = job.metadata as any;
        if (meta && meta.ugcAvatarId) {
            await prisma.uGCAvatar.update({
                where: { id: meta.ugcAvatarId },
                data: { referenceImageUrl: finalPath },
            });
            console.log(`[Webhook]   UGC Avatar ${meta.ugcAvatarId} updated with image path`);
        }

        // Check if this job was for an Animated Short Scene/Shot starting image or final video clip
        if (meta && (meta.sceneId || meta.shotId)) {
            const sceneId = meta.sceneId;
            const shotId = meta.shotId;
            const jobPurpose = meta.jobPurpose;

            if (jobPurpose === "shot_start_image" && job.jobType === "ref_image") {
                // This is a completed starting image!
                let targetScene = null;
                if (sceneId) {
                    targetScene = await prisma.docScene.findUnique({ where: { id: sceneId } });
                } else if (shotId) {
                    targetScene = await prisma.docScene.findFirst({
                        where: { searchQueries: { contains: shotId } }
                    });
                }

                if (targetScene) {
                    let searchQueriesMeta: any = {};
                    try {
                        searchQueriesMeta = JSON.parse(targetScene.searchQueries || "{}");
                    } catch {}

                    let shotToDispatch: any = null;
                    if (searchQueriesMeta.visualShots && Array.isArray(searchQueriesMeta.visualShots)) {
                        searchQueriesMeta.visualShots = searchQueriesMeta.visualShots.map((shot: any) => {
                            if ((shotId && shot.id === shotId) || shot.startImageJobId === jobId) {
                                shotToDispatch = {
                                    ...shot,
                                    startImagePath: finalPath,
                                    startImageJobStatus: "COMPLETED"
                                };
                                return shotToDispatch;
                            }
                            return shot;
                        });
                    }

                    if (shotToDispatch) {
                        // Immediately dispatch the video job!
                        const videoMetadata = {
                            shotId: shotToDispatch.id,
                            sceneId: targetScene.id,
                            duration: shotToDispatch.duration || 5,
                            chainFromPrevious: false,
                            sourceApp: "Animated Shorts",
                            title: meta.title || "Kids Story Project"
                        };

                        const videoJob = await prisma.genJob.create({
                            data: {
                                documentaryId: job.documentaryId,
                                jobType: "shot_video",
                                prompt: shotToDispatch.motionPrompt || shotToDispatch.visualPrompt,
                                status: "QUEUED",
                                metadata: videoMetadata as any
                            }
                        });

                        await dispatchJob({
                            jobId: videoJob.id,
                            documentaryId: job.documentaryId,
                            type: "shot_video",
                            prompt: shotToDispatch.motionPrompt || shotToDispatch.visualPrompt,
                            referenceImages: [finalPath],
                            metadata: videoMetadata
                        });

                        // Update the visualShots array with the new video job info
                        searchQueriesMeta.visualShots = searchQueriesMeta.visualShots.map((shot: any) => {
                            if (shot.id === shotToDispatch.id) {
                                return {
                                    ...shot,
                                    jobId: videoJob.id,
                                    jobStatus: "QUEUED"
                                };
                            }
                            return shot;
                        });
                    }

                    await prisma.docScene.update({
                        where: { id: targetScene.id },
                        data: {
                            searchQueries: JSON.stringify(searchQueriesMeta)
                        }
                    });
                }
            } else {
                // This is a completed video job or other standard visual shot clip!
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
                                return { 
                                    ...shot, 
                                    visualPath: finalPath, 
                                    jobStatus: "COMPLETED",
                                    lastFramePath: lastFramePath || undefined
                                };
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

                    // Trigger next chained shot if any is waiting for this last frame!
                    if (lastFramePath && (shotId || job.shotId)) {
                        try {
                            await dispatchNextChainedShotIfNeeded(job.documentaryId, shotId || job.shotId || "", lastFramePath);
                        } catch (chainErr: any) {
                            console.error("[Webhook Auto-Chain] Failed to check/dispatch chained shot:", chainErr.message);
                        }
                    }
                }
            }
        }

        // Update shot (video clips)
        if (job.shotId && job.jobType === "shot_video") {
            const updateData: Record<string, string> = { clipPath: finalPath };
            if (lastFramePath) updateData.lastFramePath = lastFramePath;

            await prisma.docShot.update({
                where: { id: job.shotId },
                data: updateData,
            });
            console.log(`[Webhook]   Shot ${job.shotId} clipPath set`);
        }

        // Check documentary completion
        await checkDocumentaryCompletion(job.documentaryId);

    } else if (status === "failed") {
        await prisma.genJob.update({
            where: { id: jobId },
            data: {
                status: "FAILED",
                errorMsg: error || "Unknown GPU worker error",
            },
        });
        console.error(`[Webhook]   Job ${jobId} FAILED: ${error}`);
    }

    // Check if we should trigger auto-shutdown because the queue is finished
    await triggerAutoShutdownIfNeeded();

    return NextResponse.json({ ok: true });
}

async function getDbConfig(key: string): Promise<string> {
    try {
        const row = await prisma.apiKey.findUnique({ where: { service: key } });
        if (row?.key) {
            return Buffer.from(row.key, "base64").toString("utf8");
        }
    } catch {}
    return "";
}

async function triggerAutoShutdownIfNeeded() {
    try {
        // 1. Check GenJob
        const activeGenJobs = await prisma.genJob.count({
            where: {
                status: { in: ["QUEUED", "PROCESSING"] }
            }
        });
        if (activeGenJobs > 0) return;

        // 2. Check UGCJob
        const activeUgcJobs = await prisma.uGCJob.count({
            where: {
                status: { in: ["PENDING", "GENERATING_SCRIPT", "GENERATING_VIDEO", "COMPOSITING"] }
            }
        });
        if (activeUgcJobs > 0) return;

        // 3. Check PodcastEpisode
        const activePodcastJobs = await prisma.podcastEpisode.count({
            where: {
                status: { in: ["SCRIPTING", "RECORDING", "ASSEMBLING"] }
            }
        });
        if (activePodcastJobs > 0) return;

        // If we reach here, there are absolutely 0 active jobs in the queue!
        console.log("[Auto-Shutdown] Queue is fully empty. Fetching active RunPod server to terminate...");

        const apiKey = await getDbConfig("runpod_api_key");
        if (!apiKey) return;

        // Query active pods
        const myselfQuery = `
        query {
          myself {
            pods {
              id
              status
            }
          }
        }`;
        
        const res = await fetch(`https://api.runpod.io/graphql?api_key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: myselfQuery })
        });
        if (!res.ok) return;
        const json = await res.json();
        const pods = json.data?.myself?.pods || [];

        const runningPods = pods.filter((p: any) => p.status === "RUNNING");
        if (runningPods.length === 0) {
            console.log("[Auto-Shutdown] No active running pods to shut down");
            return;
        }

        // Send termination mutation to all active pods
        for (const pod of runningPods) {
            console.log(`[Auto-Shutdown] Terminating pod: ${pod.id}`);
            const mutation = `
            mutation TerminatePod($input: PodTerminateInput!) {
              podTerminate(input: $input)
            }`;
            await fetch(`https://api.runpod.io/graphql?api_key=${apiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query: mutation,
                    variables: { input: { podId: pod.id } }
                })
            });
        }
        console.log("[Auto-Shutdown] Successfully stopped all GPU instances.");

    } catch (err: any) {
        console.error("[Auto-Shutdown] Failed during queue check & termination:", err.message);
    }
}

async function checkDocumentaryCompletion(documentaryId: string) {
    const jobs = await prisma.genJob.findMany({
        where: { documentaryId },
        select: { status: true, jobType: true },
    });

    const allDone = jobs.every((j) => j.status === "COMPLETED" || j.status === "FAILED");
    if (!allDone) return;

    const videoJobs = jobs.filter((j) => j.jobType === "shot_video");
    const videosDone = videoJobs.every((j) => j.status === "COMPLETED");
    const refImageJobs = jobs.filter((j) => j.jobType === "ref_image");
    const refImagesDone = refImageJobs.every((j) => j.status === "COMPLETED");

    const doc = await prisma.documentary.findUnique({
        where: { id: documentaryId },
        select: { status: true },
    });
    if (!doc) return;

    let newStatus: string | null = null;

    if (doc.status === "GENERATING" && refImageJobs.length > 0 && refImagesDone && videoJobs.length === 0) {
        newStatus = "ASSETS_READY";
    } else if (doc.status === "GENERATING" && videoJobs.length > 0 && videosDone) {
        newStatus = "ASSETS_READY";
    }

    // If ALL ref_image jobs failed (none completed), set to FAILED so user sees retry options
    const allRefImagesFailed = refImageJobs.length > 0 && refImageJobs.every((j) => j.status === "FAILED") && videoJobs.length === 0;
    if (doc.status === "GENERATING" && allRefImagesFailed) {
        newStatus = "FAILED";
        console.log(`[Webhook] All ${refImageJobs.length} image jobs failed — setting status to FAILED`);
    }

    if (newStatus) {
        await prisma.documentary.update({
            where: { id: documentaryId },
            data: { status: newStatus as any },
        });
        console.log(`[Webhook] Documentary ${documentaryId} → ${newStatus}`);
    }
}

async function dispatchPendingVideoJobsForCharacter(projectId: string, characterId: string, characterImagePath: string) {
    const project = await prisma.documentary.findUnique({
        where: { id: projectId },
        include: {
            assets: { where: { id: characterId } },
            scenes: { orderBy: { sceneIndex: "asc" } }
        }
    });
    if (!project || project.assets.length === 0) return;
    const charAsset = project.assets[0];

    console.log(`[Webhook] Auto-dispatching video jobs for character "${charAsset.label}" using avatar: ${characterImagePath}`);

    for (const scene of project.scenes) {
        let searchQueriesParsed: any = {};
        try {
            if (scene.searchQueries && scene.searchQueries.startsWith("{")) {
                searchQueriesParsed = JSON.parse(scene.searchQueries);
            }
        } catch {}

        const visualShots = searchQueriesParsed.visualShots || [];
        let modified = false;
        const updatedVisualShots = [];

        for (const shot of visualShots) {
            if (shot.jobStatus === "PENDING_AVATAR" && shot.primaryCharacter && shot.primaryCharacter.toLowerCase() === charAsset.label.toLowerCase()) {
                console.log(`[Webhook]   Queueing shot ${shot.id} for scene ${scene.id}`);
                
                const jobMetadata = {
                    shotId: shot.id,
                    sceneId: scene.id,
                    duration: shot.duration || 5,
                    chainFromPrevious: !!shot.chainFromPrevious,
                    sourceApp: "Animated Shorts",
                    title: project.title || "Kids Story Project"
                };

                // Create a GenJob for video
                const job = await prisma.genJob.create({
                    data: {
                        documentaryId: project.id,
                        jobType: "shot_video",
                        prompt: shot.visualPrompt,
                        status: "QUEUED",
                        metadata: jobMetadata as any
                    }
                });

                // Dispatch to GPU worker queue
                await dispatchJob({
                    jobId: job.id,
                    documentaryId: project.id,
                    type: "shot_video",
                    prompt: shot.visualPrompt,
                    referenceImages: [characterImagePath],
                    metadata: jobMetadata
                });

                shot.jobId = job.id;
                shot.jobStatus = "QUEUED";
                modified = true;
            }
            updatedVisualShots.push(shot);
        }

        if (modified) {
            searchQueriesParsed.visualShots = updatedVisualShots;
            await prisma.docScene.update({
                where: { id: scene.id },
                data: {
                    searchQueries: JSON.stringify(searchQueriesParsed)
                }
            });
        }
    }
}

async function dispatchNextChainedShotIfNeeded(documentaryId: string, completedShotId: string, completedLastFramePath: string) {
    const project = await prisma.documentary.findUnique({
        where: { id: documentaryId },
        include: {
            scenes: { orderBy: { sceneIndex: "asc" } }
        }
    });
    if (!project) return;

    // Build a flat list of all shots in the project
    let allShots: any[] = [];
    let shotSceneMap: Record<string, string> = {}; // shotId -> sceneId
    for (const scene of project.scenes) {
        let meta: any = {};
        try {
            meta = JSON.parse(scene.searchQueries || "{}");
        } catch {}
        const shots = meta.visualShots || [];
        for (const s of shots) {
            allShots.push(s);
            shotSceneMap[s.id] = scene.id;
        }
    }

    // Find the index of the completed shot
    const compIdx = allShots.findIndex(s => s.id === completedShotId);
    if (compIdx === -1 || compIdx === allShots.length - 1) return; // Completed shot not found or is the last shot

    const nextShot = allShots[compIdx + 1];
    const nextShotSceneId = shotSceneMap[nextShot.id];

    if (nextShot && nextShot.chainFromPrevious && (nextShot.jobStatus === "PENDING_PREVIOUS" || nextShot.jobStatus === "IDLE")) {
        console.log(`[Webhook Auto-Chain] Dispatching next chained shot ${nextShot.id} using lastFramePath: ${completedLastFramePath}`);

        const jobMetadata = {
            shotId: nextShot.id,
            sceneId: nextShotSceneId,
            duration: nextShot.duration || 5,
            chainFromPrevious: true,
            sourceApp: "Animated Shorts",
            title: project.title || "Kids Story Project"
        };

        const job = await prisma.genJob.create({
            data: {
                documentaryId: project.id,
                jobType: "shot_video",
                prompt: nextShot.motionPrompt || nextShot.visualPrompt,
                status: "QUEUED",
                metadata: jobMetadata as any
            }
        });

        await dispatchJob({
            jobId: job.id,
            documentaryId: project.id,
            type: "shot_video",
            prompt: nextShot.motionPrompt || nextShot.visualPrompt,
            referenceImages: [completedLastFramePath],
            metadata: jobMetadata
        });

        // Update the shot status inside the DB scene
        const targetScene = project.scenes.find(s => s.id === nextShotSceneId);
        if (targetScene) {
            let meta: any = {};
            try {
                meta = JSON.parse(targetScene.searchQueries || "{}");
            } catch {}
            if (meta.visualShots) {
                meta.visualShots = meta.visualShots.map((s: any) => {
                    if (s.id === nextShot.id) {
                        return {
                            ...s,
                            jobId: job.id,
                            jobStatus: "QUEUED"
                        };
                    }
                    return s;
                });
                await prisma.docScene.update({
                    where: { id: targetScene.id },
                    data: { searchQueries: JSON.stringify(meta) }
                });
            }
        }
    }
}
