import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRedis, CHANNELS, dispatchJob } from "@/lib/documentary/redis-client";
import { organizeCompletedJobAsset } from "@/lib/documentary/asset-organizer";

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const idsString = searchParams.get("jobIds");
    if (!idsString) return NextResponse.json({ jobs: [] });

    const jobIds = idsString.split(",");

    try {
        const redis = getRedis();

        // 1. Drain any pending completed/failed results from Redis queue to update database state
        for (let i = 0; i < 50; i++) {
            const result = await redis.rpop(CHANNELS.DOCUMENTARY_RESULTS);
            if (!result) break; // Results queue is empty

            try {
                const data = JSON.parse(result);
                const jobId = data.jobId;
                const status = data.status === "completed" ? "COMPLETED" : "FAILED";
                let outputPath = data.outputPath || null;
                const lastFramePath = data.lastFramePath || null;
                const errorMsg = data.error || null;

                if (status === "COMPLETED" && outputPath) {
                    outputPath = await organizeCompletedJobAsset(jobId, outputPath);
                }

                // Update GenJob record
                const job = await prisma.genJob.update({
                    where: { id: jobId },
                    data: {
                        status,
                        outputPath,
                        errorMsg,
                    },
                });

                // A. Update Character Image if it's an Avatar
                if (status === "COMPLETED" && outputPath && job.assetId) {
                    const updatedAsset = await prisma.docAsset.update({
                        where: { id: job.assetId },
                        data: { imagePath: outputPath },
                        include: { documentary: true }
                    });

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
                                    data: { imagePath: outputPath }
                                });
                                console.log(`[Status Sync] Synced avatar image to ${siblings.length} duplicate character instances for user ${userId}`);
                            }
                        } catch (syncErr: any) {
                            console.error("[Status Sync] Failed to sync duplicate character avatars:", syncErr.message);
                        }
                    }
                }

                // B. Update DocShot if it's a Documentary Video
                if (status === "COMPLETED" && outputPath && job.shotId && job.jobType === "shot_video") {
                    await prisma.docShot.update({
                        where: { id: job.shotId },
                        data: { clipPath: outputPath },
                    });
                }

                // C. Update DocScene if it's an Animated Short Scene/Shot
                const meta = job.metadata as any;
                if (meta && (meta.sceneId || meta.shotId)) {
                    const sceneId = meta.sceneId;
                    const shotId = meta.shotId;
                    const jobPurpose = meta.jobPurpose;
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

                        if (jobPurpose === "shot_start_image" && job.jobType === "ref_image") {
                            // This is a completed starting image!
                            let shotToDispatch: any = null;
                            if (searchQueriesMeta.visualShots && Array.isArray(searchQueriesMeta.visualShots)) {
                                searchQueriesMeta.visualShots = searchQueriesMeta.visualShots.map((shot: any) => {
                                    if ((shotId && shot.id === shotId) || shot.startImageJobId === jobId) {
                                        shotToDispatch = {
                                            ...shot,
                                            startImagePath: outputPath,
                                            startImageJobStatus: "COMPLETED"
                                        };
                                        return shotToDispatch;
                                    }
                                    return shot;
                                });
                            }

                            if (shotToDispatch && status === "COMPLETED") {
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
                                    referenceImages: [outputPath || ""],
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
                        } else {
                            // This is a completed video job!
                            if (searchQueriesMeta.visualShots && Array.isArray(searchQueriesMeta.visualShots)) {
                                searchQueriesMeta.visualShots = searchQueriesMeta.visualShots.map((shot: any) => {
                                    if ((shotId && shot.id === shotId) || shot.jobId === jobId) {
                                        return {
                                            ...shot,
                                            visualPath: status === "COMPLETED" ? (outputPath || shot.visualPath) : shot.visualPath,
                                            jobStatus: status,
                                            ...(status === "COMPLETED" && lastFramePath ? { lastFramePath } : {})
                                        };
                                    }
                                    return shot;
                                });

                                let updatedPath = targetScene.assembledPath;
                                const allDone = searchQueriesMeta.visualShots.every((s: any) => s.jobStatus === "COMPLETED" || (!s.jobId && s.visualPath));
                                if (allDone && searchQueriesMeta.visualShots.length > 0) {
                                    const lastShot = searchQueriesMeta.visualShots[searchQueriesMeta.visualShots.length - 1];
                                    if (lastShot.visualPath) {
                                        updatedPath = lastShot.visualPath;
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
                    }
                }
            } catch (err) {
                console.error("[Status Sync] Error processing result:", err);
            }
        }

        // 2. Retroactive fallback: link any already COMPLETED GenJob records in the DB to their scene records
        try {
            const completedJobs = await prisma.genJob.findMany({
                where: {
                    id: { in: jobIds },
                    status: "COMPLETED",
                    outputPath: { not: null }
                }
            });

            for (const job of completedJobs) {
                if (job.outputPath) {
                    const organizedPath = await organizeCompletedJobAsset(job.id, job.outputPath);
                    if (organizedPath !== job.outputPath) {
                        await prisma.genJob.update({
                            where: { id: job.id },
                            data: { outputPath: organizedPath }
                        });
                        job.outputPath = organizedPath;
                    }
                }

                const meta = job.metadata as any;
                if (meta && (meta.sceneId || meta.shotId) && job.outputPath) {
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
                        let updatedPath = job.outputPath;
                        let searchQueriesMeta: any = {};
                        try {
                            searchQueriesMeta = JSON.parse(targetScene.searchQueries || "{}");
                        } catch {}

                        if (searchQueriesMeta.visualShots && Array.isArray(searchQueriesMeta.visualShots)) {
                            searchQueriesMeta.visualShots = searchQueriesMeta.visualShots.map((shot: any) => {
                                if ((shotId && shot.id === shotId) || shot.jobId === job.id) {
                                    return { ...shot, visualPath: job.outputPath, jobStatus: "COMPLETED" };
                                }
                                  return shot;
                            });

                             const allDone = searchQueriesMeta.visualShots.every((s: any) => s.jobStatus === "COMPLETED" || (!s.jobId && s.visualPath));
                             if (allDone && searchQueriesMeta.visualShots.length > 0) {
                                 updatedPath = searchQueriesMeta.visualShots[searchQueriesMeta.visualShots.length - 1].visualPath || job.outputPath;
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
            }
        } catch (retroErr) {
            console.error("[Status Sync] Retroactive link check failed:", retroErr);
        }

        // 3. Query the current database state of the requested jobs to send back
        const jobs = await prisma.genJob.findMany({
            where: {
                id: { in: jobIds }
            }
        });

        return NextResponse.json({ jobs });
    } catch (err: any) {
        console.error("[Scene Video Status] Error:", err.message);
        return NextResponse.json({ error: "Failed to query status", details: err.message }, { status: 500 });
    }
}
