import { prisma } from "./lib/prisma";

import { getRedis, CHANNELS } from "./lib/documentary/redis-client";
import { organizeCompletedJobAsset } from "./lib/documentary/asset-organizer";

async function main() {
    console.log("Simulating GET /api/animated/projects...");
    try {
        const redis = getRedis();

        // 1. Drain pending finished task results from Redis
        console.log("Draining Redis queue...");
        for (let i = 0; i < 50; i++) {
            const result = await redis.rpop(CHANNELS.DOCUMENTARY_RESULTS);
            if (!result) break;

            try {
                const data = JSON.parse(result);
                const jobId = data.jobId;
                const status = data.status === "completed" ? "COMPLETED" : "FAILED";
                let outputPath = data.outputPath || null;

                if (status === "COMPLETED" && outputPath) {
                    outputPath = await organizeCompletedJobAsset(jobId, outputPath);
                }

                await prisma.genJob.update({
                    where: { id: jobId },
                    data: { status, outputPath }
                });
            } catch (inner: any) {
                console.error("Inner loop error:", inner.message);
            }
        }

        // 2. Fetch projects
        console.log("Fetching projects...");
        const projects = await prisma.documentary.findMany({
            where: {
                genre: "children"
            },
            include: {
                assets: {
                    where: { type: "CHARACTER" }
                },
                scenes: {
                    orderBy: { sceneIndex: "asc" }
                }
            },
            orderBy: { updatedAt: "desc" }
        });

        console.log(`Fetched ${projects.length} projects. Mapping...`);

        const mapped = await Promise.all(projects.map(async (p) => {
            const metaConfig = (p.rawArticles && typeof p.rawArticles === "object")
                ? (p.rawArticles as Record<string, any>)
                : {};
            
            const videoId = p.sourceUrls && p.sourceUrls.length > 0 ? p.sourceUrls[0] : "";
            let visualAnalysis = null;
            if (videoId) {
                const video = await prisma.video.findUnique({
                    where: { id: videoId },
                    select: { description: true }
                });
                if (video?.description) {
                    try {
                        visualAnalysis = JSON.parse(video.description);
                    } catch (e) {}
                }
            }

            return {
                id: p.id,
                title: p.title,
                script: p.script,
                status: p.status,
                finalVideoPath: p.finalVideoPath,
                sourceUrls: p.sourceUrls || [],
                targetDuration: p.totalDuration || 2.0,
                characters: p.assets.map(a => ({
                    id: a.id,
                    name: a.label,
                    prompt: a.prompt || "",
                    imagePath: a.imagePath || ""
                }))
            };
        }));

        console.log("Successfully mapped all projects:", JSON.stringify(mapped, null, 2));

    } catch (err: any) {
        console.error("CRITICAL ERROR IN ROUTE:", err.stack || err.message || err);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
