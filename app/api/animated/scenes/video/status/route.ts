import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRedis, CHANNELS } from "@/lib/documentary/redis-client";
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
                    await prisma.docAsset.update({
                        where: { id: job.assetId },
                        data: { imagePath: outputPath },
                    });
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
                if (status === "COMPLETED" && outputPath && meta && (meta.sceneId || meta.shotId)) {
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
                        let updatedPath = outputPath;
                        let searchQueriesMeta: any = {};
                        try {
                            searchQueriesMeta = JSON.parse(targetScene.searchQueries || "{}");
                        } catch {}

                        if (searchQueriesMeta.visualShots && Array.isArray(searchQueriesMeta.visualShots)) {
                            searchQueriesMeta.visualShots = searchQueriesMeta.visualShots.map((shot: any) => {
                                if ((shotId && shot.id === shotId) || shot.jobId === jobId) {
                                    return { ...shot, visualPath: outputPath, jobStatus: "COMPLETED" };
                                }
                                return shot;
                            });

                            const allDone = searchQueriesMeta.visualShots.every((s: any) => s.jobStatus === "COMPLETED" || s.visualPath);
                            if (allDone && searchQueriesMeta.visualShots.length > 0) {
                                updatedPath = searchQueriesMeta.visualShots[searchQueriesMeta.visualShots.length - 1].visualPath || outputPath;
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

                    if (targetScene && !targetScene.assembledPath) {
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

                            const allDone = searchQueriesMeta.visualShots.every((s: any) => s.jobStatus === "COMPLETED" || s.visualPath);
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
