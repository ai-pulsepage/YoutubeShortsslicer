import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dispatchJob } from "@/lib/documentary/redis-client";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { docId, episodeNumber, action } = body;

        if (!docId || !episodeNumber) {
            return NextResponse.json({ error: "Missing docId or episodeNumber" }, { status: 400 });
        }

        const doc = await prisma.documentary.findUnique({
            where: { id: docId },
            include: {
                scenes: {
                    include: {
                        shots: { orderBy: { shotIndex: "asc" } }
                    }
                }
            }
        });

        if (!doc) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        const targetScene = doc.scenes.find(s => s.sceneIndex === episodeNumber || s.sceneIndex === (episodeNumber - 1));
        if (!targetScene) {
            return NextResponse.json({ error: `Episode ${episodeNumber} not found in project` }, { status: 404 });
        }

        if (action === "reset" || action === "relaunch") {
            // Reset rendered clip paths on all shots in this episode
            const shotIds = targetScene.shots.map(s => s.id);
            await prisma.docShot.updateMany({
                where: { id: { in: shotIds } },
                data: { clipPath: null, lastFramePath: null }
            });
            // Clear existing stuck/queued jobs for these shots
            await prisma.genJob.deleteMany({
                where: { shotId: { in: shotIds } }
            });
        }

        if (action === "reset") {
            return NextResponse.json({ success: true, message: `Reset renders for Episode ${episodeNumber}` });
        }

        // Launch / Relaunch: Queue ALL shots for this episode directly into Redis
        const dispatchedJobs = [];
        for (const shot of targetScene.shots) {
            const r2Key = `shows/${doc.id}/scene_${targetScene.id}_shot_${shot.id}.mp4`;
            const jobMetadata = {
                docId: doc.id,
                sceneId: targetScene.id,
                shotId: shot.id,
                title: doc.title,
                episodeNumber,
                shotIndex: shot.shotIndex,
                sourceApp: "Film Factory Studio",
                model: "wan2.3",
                voiceEngine: "cosyvoice2",
                r2Key
            };

            const genJob = await prisma.genJob.create({
                data: {
                    documentaryId: doc.id,
                    jobType: "shot_video",
                    prompt: shot.compositePrompt || shot.action,
                    status: "QUEUED",
                    shotId: shot.id,
                    metadata: jobMetadata as any
                }
            });

            await dispatchJob({
                jobId: genJob.id,
                documentaryId: doc.id,
                type: "shot_video",
                prompt: shot.compositePrompt || shot.action || "",
                referenceImages: [],
                metadata: jobMetadata
            });
            dispatchedJobs.push(genJob);
        }

        return NextResponse.json({
            success: true,
            action,
            episodeNumber,
            dispatchedCount: dispatchedJobs.length
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || "Failed to process episode action" }, { status: 500 });
    }
}
