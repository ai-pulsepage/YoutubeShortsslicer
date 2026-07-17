import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRedis, CHANNELS, dispatchJob } from "@/lib/documentary/redis-client";
import { organizeCompletedJobAsset } from "@/lib/documentary/asset-organizer";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { jobIds } = await req.json();
        if (!jobIds || !Array.isArray(jobIds)) {
            return NextResponse.json({ error: "jobIds array is required" }, { status: 400 });
        }

        const redis = getRedis();

        // 1. Drain pending results from Redis to update Postgres (exactly like the projects route does)
        for (let i = 0; i < 50; i++) {
            const result = await redis.rpop(CHANNELS.DOCUMENTARY_RESULTS);
            if (!result) break;

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

                const job = await prisma.genJob.update({
                    where: { id: jobId },
                    data: { status, outputPath, errorMsg }
                });

                if (status === "COMPLETED" && outputPath) {
                    if (job.assetId) {
                        await prisma.docAsset.update({
                            where: { id: job.assetId },
                            data: { imagePath: outputPath }
                        });
                    }

                    if (job.shotId && job.jobType === "shot_video") {
                        await prisma.docShot.update({
                            where: { id: job.shotId },
                            data: { clipPath: outputPath }
                        });
                    }
                }

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
                console.error("[Poll Sync] Error processing result:", err);
            }
        }

        // 2. Fetch current status for requested jobs
        const jobs = await prisma.genJob.findMany({
            where: {
                id: { in: jobIds }
            },
            select: {
                id: true,
                status: true,
                outputPath: true,
                errorMsg: true
            }
        });

        return NextResponse.json({ jobs });

    } catch (err: any) {
        console.error("[Scene Video Poll] Error:", err.message);
        return NextResponse.json({ error: "Failed to poll statuses", details: err.message }, { status: 500 });
    }
}
