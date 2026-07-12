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

        let queuedAvatarsCount = 0;
        let queuedShotsCount = 0;

        // 2. Batch queue pending character avatars
        // We will update the character assets in postgres
        const updatedAssets = [];
        for (const asset of project.assets) {
            // If the character doesn't have an avatar face yet, queue it!
            if (!asset.imagePath) {
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
                    metadata: { characterId: asset.id, model: "flux" }
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
            for (const shot of visualShots) {
                // Queue shot if it's IDLE, FAILED, or missing videoPath
                if (!shot.visualPath && (shot.jobStatus === "IDLE" || shot.jobStatus === "FAILED" || !shot.jobStatus)) {
                    // Create a GenJob for video
                    const job = await prisma.genJob.create({
                        data: {
                            documentaryId: project.id,
                            jobType: "shot_video",
                            prompt: shot.visualPrompt,
                            status: "QUEUED",
                            metadata: { shotId: shot.id } as any
                        }
                    });

                    // Retrieve primary character avatar reference if mapped
                    let referenceImages: string[] = [];
                    if (shot.primaryCharacter) {
                        const charAsset = project.assets.find(
                            a => a.label.toLowerCase() === shot.primaryCharacter.toLowerCase()
                        );
                        if (charAsset?.imagePath) {
                            referenceImages = [charAsset.imagePath];
                        }
                    }

                    // Dispatch to GPU worker queue
                    await dispatchJob({
                        jobId: job.id,
                        documentaryId: project.id,
                        type: "shot_video",
                        prompt: shot.visualPrompt,
                        referenceImages,
                        metadata: { shotId: shot.id, sceneId: scene.id }
                    });

                    shot.jobId = job.id;
                    shot.jobStatus = "QUEUED";
                    modified = true;
                    queuedShotsCount++;
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
