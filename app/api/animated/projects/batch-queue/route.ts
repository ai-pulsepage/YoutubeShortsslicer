import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dispatchJob } from "@/lib/documentary/redis-client";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId } = await req.json();
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
                        metadata: { characterId: asset.id } as any
                    }
                });

                // Dispatch to GPU worker queue
                await dispatchJob({
                    jobId: job.id,
                    documentaryId: project.id,
                    type: "ref_image",
                    prompt: asset.prompt || "",
                    referenceImages: [],
                    metadata: { characterId: asset.id, model: "flux", sourceApp: "Animated Shorts", title: project.title || "Kids Story Project" }
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
                // Queue shot if it's IDLE, FAILED, or missing videoPath
                if (!shot.visualPath && (shot.jobStatus === "IDLE" || shot.jobStatus === "FAILED" || !shot.jobStatus || shot.jobStatus === "PENDING_AVATAR")) {
                    const alreadyQueuedVideo = activeJobs.some(j => {
                        const meta = j.metadata as any;
                        return j.jobType === "shot_video" && meta && meta.sceneId === scene.id && meta.shotId === shot.id;
                    });
                    
                    if (alreadyQueuedVideo) {
                        console.log(`[Batch Queue] Video job for shot ${shot.id} is already active. Skipping duplicate.`);
                        updatedVisualShots.push(shot);
                        continue;
                    }

                    let referenceImages: string[] = [];
                    let hasMissingAvatar = false;
                    let hasChainedImage = false;

                    // Try to load context frame if transition chaining is enabled
                    if (shot.chainFromPrevious) {
                        const prevShot = getPreviousShot(project, scene, sIdx);
                        if (prevShot && prevShot.lastFramePath) {
                            referenceImages = [prevShot.lastFramePath];
                            hasChainedImage = true;
                            console.log(`[Batch Queue] Shot ${shot.id} chained from previous frame: ${prevShot.lastFramePath}`);
                        }
                    }

                    // Fallback to character avatar if not chained or chained frame is missing
                    if (!hasChainedImage && shot.primaryCharacter && shot.primaryCharacter !== "None") {
                        const charAsset = project.assets.find(
                            a => a.label.toLowerCase() === shot.primaryCharacter.toLowerCase()
                        );
                        if (charAsset) {
                            if (charAsset.imagePath) {
                                referenceImages = [charAsset.imagePath];
                            } else {
                                hasMissingAvatar = true;
                            }
                        }
                    }

                    if (hasMissingAvatar) {
                        // Mark as pending avatar, do not dispatch to Redis yet
                        shot.jobStatus = "PENDING_AVATAR";
                        modified = true;
                    } else {
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
                            referenceImages,
                            metadata: jobMetadata
                        });

                        shot.jobId = job.id;
                        shot.jobStatus = "QUEUED";
                        modified = true;
                        queuedShotsCount++;
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
