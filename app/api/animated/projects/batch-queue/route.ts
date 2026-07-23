import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dispatchJob } from "@/lib/documentary/redis-client";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId, forceReRender } = await req.json();
    if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

    try {
        // 1. Fetch documentary project details
        const project = await prisma.documentary.findUnique({
            where: { id: projectId },
            include: {
                assets: { where: { type: "CHARACTER" } },
                scenes: { orderBy: { sceneIndex: "asc" } }
            }
        });

        if (!project) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        // Load all active (QUEUED or PROCESSING) jobs for this project to check for duplicates
        const activeJobs = await prisma.genJob.findMany({
            where: {
                documentaryId: project.id,
                status: { in: ["QUEUED", "PROCESSING"] }
            }
        });

        let queuedAvatarsCount = 0;
        let queuedShotsCount = 0;

        // 2. Batch queue pending character avatars
        for (const asset of project.assets) {
            // If the character doesn't have an avatar face yet, queue it!
            if (!asset.imagePath) {
                const alreadyQueued = activeJobs.some(
                    j => j.jobType === "ref_image" && j.assetId === asset.id
                );
                if (alreadyQueued) {
                    console.log(`[Batch Queue] Avatar for character "${asset.label}" is already active. Skipping duplicate.`);
                    continue;
                }

                // Create a GenJob
                const job = await prisma.genJob.create({
                    data: {
                        documentaryId: project.id,
                        jobType: "ref_image",
                        prompt: asset.prompt || "",
                        status: "QUEUED",
                        assetId: asset.id,
                        metadata: { 
                            characterId: asset.id,
                            r2Key: `animated/avatars/${asset.id}.webp`
                        } as any
                    }
                });

                // Dispatch to GPU worker queue
                await dispatchJob({
                    jobId: job.id,
                    documentaryId: project.id,
                    type: "ref_image",
                    prompt: asset.prompt || "",
                    referenceImages: [],
                    metadata: { 
                        characterId: asset.id, 
                        model: "flux", 
                        sourceApp: "Animated Shorts", 
                        title: project.title || "Kids Story Project",
                        r2Key: `animated/avatars/${asset.id}.webp`
                    }
                });

                queuedAvatarsCount++;
            }
        }

        // 3. Batch queue pending storyboard video shots
        const updatedScenes = [];
        for (const scene of project.scenes) {
            let searchQueriesParsed: any = {};
            try {
                if (scene.searchQueries && scene.searchQueries.startsWith("{")) {
                    searchQueriesParsed = JSON.parse(scene.searchQueries);
                }
            } catch (e) {
                // Ignore
            }

            const visualShots = searchQueriesParsed.visualShots || [];
            let modified = false;

            const updatedVisualShots = [];
            for (let sIdx = 0; sIdx < visualShots.length; sIdx++) {
                const shot = visualShots[sIdx];
                // Queue shot if forceReRender is requested, or if missing videoPath / in pending status
                if (forceReRender) {
                    delete shot.visualPath;
                    delete shot.lastFramePath;
                    shot.jobStatus = "IDLE";
                }
                if (!shot.visualPath && (shot.jobStatus === "IDLE" || shot.jobStatus === "FAILED" || !shot.jobStatus || shot.jobStatus === "PENDING_PREVIOUS" || shot.jobStatus === "PENDING_AVATAR" || shot.jobStatus === "GENERATING_IMAGE")) {
                    
                    // Check if there is already an active job for this shot (either image generation or video animation)
                    const alreadyQueuedJob = activeJobs.some(j => {
                        const meta = j.metadata as any;
                        return meta && meta.sceneId === scene.id && meta.shotId === shot.id;
                    });
                    
                    if (alreadyQueuedJob) {
                        console.log(`[Batch Queue] Active job for shot ${shot.id} already exists. Skipping duplicate.`);
                        updatedVisualShots.push(shot);
                        continue;
                    }

                    // ─── Case 1: Chained Transitions ───
                    if (shot.chainFromPrevious) {
                        const prevShot = getPreviousShot(project, scene, sIdx);
                        if (prevShot && prevShot.lastFramePath) {
                            // Previous shot is complete, we can dispatch the video animation job immediately!
                            const jobMetadata = {
                                shotId: shot.id,
                                sceneId: scene.id,
                                duration: shot.duration || 5,
                                chainFromPrevious: true,
                                sourceApp: "Animated Shorts",
                                title: project.title || "Kids Story Project",
                                r2Key: `animated/projects/${project.id}/scenes/${scene.id}/shots/shot_${shot.id}_video.mp4`,
                                r2KeyLastFrame: `animated/projects/${project.id}/scenes/${scene.id}/shots/shot_${shot.id}_last_frame.png`
                            };

                            const job = await prisma.genJob.create({
                                data: {
                                    documentaryId: project.id,
                                    jobType: "shot_video",
                                    prompt: shot.motionPrompt || shot.visualPrompt,
                                    status: "QUEUED",
                                    metadata: jobMetadata as any
                                }
                            });

                            await dispatchJob({
                                jobId: job.id,
                                documentaryId: project.id,
                                type: "shot_video",
                                prompt: shot.motionPrompt || shot.visualPrompt,
                                referenceImages: [prevShot.lastFramePath],
                                metadata: jobMetadata
                            });

                            shot.jobId = job.id;
                            shot.jobStatus = "QUEUED";
                            modified = true;
                            queuedShotsCount++;
                        } else {
                            // Previous shot is not rendered yet, set status to PENDING_PREVIOUS so webhook dispatches it later
                            if (shot.jobStatus !== "PENDING_PREVIOUS") {
                                shot.jobStatus = "PENDING_PREVIOUS";
                                shot.jobId = undefined;
                                modified = true;
                            }
                        }
                    } 
                    // ─── Case 2: Hard Cuts / Unchained (Composition Stage) ───
                    else {
                        if (shot.startImagePath) {
                            // We already generated the starting image, dispatch the video job!
                            const jobMetadata = {
                                shotId: shot.id,
                                sceneId: scene.id,
                                duration: shot.duration || 5,
                                chainFromPrevious: false,
                                sourceApp: "Animated Shorts",
                                title: project.title || "Kids Story Project",
                                r2Key: `animated/projects/${project.id}/scenes/${scene.id}/shots/shot_${shot.id}_video.mp4`,
                                r2KeyLastFrame: `animated/projects/${project.id}/scenes/${scene.id}/shots/shot_${shot.id}_last_frame.png`
                            };

                            const job = await prisma.genJob.create({
                                data: {
                                    documentaryId: project.id,
                                    jobType: "shot_video",
                                    prompt: shot.motionPrompt || shot.visualPrompt,
                                    status: "QUEUED",
                                    metadata: jobMetadata as any
                                }
                            });

                            await dispatchJob({
                                jobId: job.id,
                                documentaryId: project.id,
                                type: "shot_video",
                                prompt: shot.motionPrompt || shot.visualPrompt,
                                referenceImages: [shot.startImagePath],
                                metadata: jobMetadata
                            });

                            shot.jobId = job.id;
                            shot.jobStatus = "QUEUED";
                            modified = true;
                            queuedShotsCount++;
                        } else {
                            // Generate starting image first using FLUX
                            const jobMetadata = {
                                shotId: shot.id,
                                sceneId: scene.id,
                                jobPurpose: "shot_start_image",
                                sourceApp: "Animated Shorts",
                                model: "flux",
                                title: project.title || "Kids Story Project",
                                r2Key: `animated/projects/${project.id}/scenes/${scene.id}/shots/shot_${shot.id}_start.webp`
                            };

                            const job = await prisma.genJob.create({
                                data: {
                                    documentaryId: project.id,
                                    jobType: "ref_image",
                                    prompt: shot.imagePrompt || shot.visualPrompt,
                                    status: "QUEUED",
                                    metadata: jobMetadata as any
                                }
                            });

                            let characterRefImage: string | null = null;
                            if (shot.primaryCharacter && shot.primaryCharacter !== "None" && shot.primaryCharacter !== "Narrator") {
                                const charAsset = project.assets.find(
                                    (a: any) => a.type === "CHARACTER" && a.label === shot.primaryCharacter
                                );
                                if (charAsset && charAsset.imagePath) {
                                    characterRefImage = charAsset.imagePath;
                                }
                            }

                            await dispatchJob({
                                jobId: job.id,
                                documentaryId: project.id,
                                type: "ref_image",
                                prompt: shot.imagePrompt || shot.visualPrompt,
                                referenceImages: characterRefImage ? [characterRefImage] : [],
                                metadata: jobMetadata
                            });

                            shot.startImageJobId = job.id;
                            shot.startImageJobStatus = "QUEUED";
                            shot.jobStatus = "GENERATING_IMAGE";
                            modified = true;
                            queuedShotsCount++;
                        }
                    }
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

        return NextResponse.json({
            success: true,
            queuedAvatarsCount,
            queuedShotsCount
        });

    } catch (err: any) {
        console.error("[Batch Queue Project] Error:", err.message);
        return NextResponse.json({ error: "Failed to batch queue project", details: err.message }, { status: 500 });
    }
}

function getPreviousShot(project: any, currentScene: any, currentShotIndex: number) {
    if (currentShotIndex > 0) {
        const parsed = JSON.parse(currentScene.searchQueries || "{}");
        const shots = parsed.visualShots || [];
        return shots[currentShotIndex - 1];
    }
    
    // Find the previous scene
    const prevScene = project.scenes.find((s: any) => s.sceneIndex === currentScene.sceneIndex - 1);
    if (prevScene) {
        const parsed = JSON.parse(prevScene.searchQueries || "{}");
        const shots = parsed.visualShots || [];
        if (shots.length > 0) {
            return shots[shots.length - 1];
        }
    }
    return null;
}
