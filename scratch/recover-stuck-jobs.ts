import { prisma } from "../lib/prisma";
import { organizeCompletedJobAsset } from "../lib/documentary/asset-organizer";

async function recover() {
    console.log("=== Starting S3/R2 Asset Recovery ===");

    // Fetch all failed or processing GenJobs from the documentary pipelines
    const jobs = await prisma.genJob.findMany({
        where: {
            status: { in: ["FAILED", "PROCESSING"] }
        },
        include: { documentary: true }
    });

    console.log(`Found ${jobs.length} jobs to inspect...`);

    let recoveredCount = 0;

    for (const job of jobs) {
        // Construct the expected raw key for this job type
        const extension = job.jobType === "shot_video" ? "mp4" : "png";
        const folder = job.jobType === "shot_video" ? "clips" : "assets";
        const rawKey = `documentaries/${folder}/${job.id}.${extension}`;

        console.log(`Checking job ${job.id} (${job.jobType}) - expected key: ${rawKey}`);

        try {
            // Attempt to organize the asset
            const finalPath = await organizeCompletedJobAsset(job.id, rawKey);

            if (finalPath !== rawKey) {
                // If finalPath changed, it means the asset was successfully found and moved!
                console.log(`[Success] Recovered and moved asset for job ${job.id} -> ${finalPath}`);

                // Update the GenJob status to COMPLETED
                await prisma.genJob.update({
                    where: { id: job.id },
                    data: {
                        status: "COMPLETED",
                        outputPath: finalPath,
                        errorMsg: null
                    }
                });

                // Update corresponding DocShot if it exists
                if (job.shotId && job.jobType === "shot_video") {
                    await prisma.docShot.update({
                        where: { id: job.shotId },
                        data: { clipPath: finalPath }
                    });
                    console.log(`  Updated DocShot ${job.shotId} clipPath`);
                }

                // Update corresponding DocScene if it exists
                const meta = job.metadata as any;
                if (meta && meta.sceneId) {
                    const scene = await prisma.docScene.findUnique({ where: { id: meta.sceneId } });
                    if (scene) {
                        let searchQueriesMeta: any = {};
                        try {
                            searchQueriesMeta = JSON.parse(scene.searchQueries || "{}");
                        } catch {}

                        if (searchQueriesMeta.visualShots && Array.isArray(searchQueriesMeta.visualShots)) {
                            searchQueriesMeta.visualShots = searchQueriesMeta.visualShots.map((shot: any) => {
                                if (shot.jobId === job.id || (meta.shotId && shot.id === meta.shotId)) {
                                    return {
                                        ...shot,
                                        visualPath: finalPath,
                                        jobStatus: "COMPLETED"
                                    };
                                }
                                return shot;
                            });
                        }

                        await prisma.docScene.update({
                            where: { id: scene.id },
                            data: {
                                assembledPath: finalPath,
                                searchQueries: JSON.stringify(searchQueriesMeta)
                            }
                        });
                        console.log(`  Updated DocScene ${scene.id} assembledPath`);
                    }
                }

                recoveredCount++;
            } else {
                console.log(`  File not found or already processed for job ${job.id}`);
            }
        } catch (err: any) {
            console.error(`  [Error] Failed recovering job ${job.id}:`, err.message);
        }
    }

    console.log(`=== Recovery Complete. Recovered ${recoveredCount} jobs! ===`);
}

recover().catch(console.error);
