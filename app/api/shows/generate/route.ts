import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateCinematicShow } from "@/lib/film/film-script-engine";
import { dispatchJob } from "@/lib/documentary/redis-client";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { title, concept, genre, subStyle, numEpisodes, targetEpisodeMinutes, videoModel, voiceEngine } = await req.json();

    if (!title || !concept) {
        return NextResponse.json({ error: "title and concept are required" }, { status: 400 });
    }

    try {
        // 1. Generate full Multi-Episode Series using Cinematic Film Script Engine
        const showResult = await generateCinematicShow({
            title,
            concept,
            genre: genre || "dystopian_scifi",
            subStyle: subStyle || "default",
            numEpisodes: parseInt(numEpisodes) || 3,
            targetEpisodeMinutes: parseInt(targetEpisodeMinutes) || 3,
            videoModel: videoModel || "wan2.3",
            voiceEngine: voiceEngine || "cosyvoice2",
        });

        // 2. Save parent Show / Project in database
        const parentDoc = await prisma.documentary.create({
            data: {
                userId: session.user.id,
                title: `${showResult.showTitle} (Mini-Series)`,
                genre: showResult.genre,
                subStyle: showResult.subStyle,
                visualMode: "full_ai_video",
                status: "GENERATING",
                script: JSON.stringify(showResult),
                scenes: {
                    create: showResult.episodes.map((ep) => ({
                        sceneIndex: ep.episodeNumber,
                        title: ep.title,
                        narrationText: ep.logline,
                        searchQueries: JSON.stringify({ isEpisode: true, logline: ep.logline, cliffhanger: ep.cliffhanger }),
                        shots: {
                            create: ep.shots.map((shot) => ({
                                shotIndex: shot.shotIndex,
                                shotType: shot.shotType,
                                cameraAngle: shot.cameraAngle || "eye level",
                                cameraMovement: shot.cameraMovement || "gentle push-in",
                                action: shot.actionDescription,
                                dialogue: shot.dialogueLine || null,
                                compositePrompt: shot.kinematicPrompt,
                                duration: 5
                            }))
                        }
                    }))
                },
                assets: {
                    create: (showResult.cast || []).map((char) => ({
                        type: "CHARACTER",
                        label: char.name,
                        description: char.physicalProfile,
                        prompt: char.physicalProfile
                    }))
                }
            }
        });

        // Query database to resolve created Scenes, Shots, and Assets
        const createdDoc = await prisma.documentary.findUnique({
            where: { id: parentDoc.id },
            include: {
                scenes: {
                    include: { shots: { orderBy: { shotIndex: "asc" } } }
                },
                assets: true
            }
        });
        if (!createdDoc) {
            throw new Error("Failed to retrieve created documentary project.");
        }

        const dispatchedJobs = [];

        // 3. Dispatch character reference image jobs (FLUX 1.1 Pro + PuLID) for all cast assets
        for (const asset of createdDoc.assets || []) {
            const assetPrompt = `High-resolution studio portrait photo of ${asset.label} (${asset.description}), cinematic lighting, 8k, detailed facial features, professional photography`;
            const imageMetadata = {
                docId: parentDoc.id,
                assetId: asset.id,
                characterName: asset.label,
                sourceApp: "Film Factory Studio",
                model: "flux_pro"
            };

            const assetJob = await prisma.genJob.create({
                data: {
                    documentaryId: parentDoc.id,
                    jobType: "ref_image",
                    prompt: assetPrompt,
                    status: "QUEUED",
                    metadata: imageMetadata as any
                }
            });

            await dispatchJob({
                jobId: assetJob.id,
                documentaryId: parentDoc.id,
                type: "ref_image",
                prompt: assetPrompt,
                referenceImages: [],
                metadata: imageMetadata
            });
            dispatchedJobs.push(assetJob);
        }

        // 4. Dispatch ALL 30+ shots for each episode so the Queue Monitor shows the true full queue
        for (const ep of showResult.episodes) {
            const dbScene = createdDoc.scenes.find(s => s.sceneIndex === ep.episodeNumber);
            if (!dbScene) continue;

            for (const shot of ep.shots) {
                const dbShot = dbScene.shots.find(s => s.shotIndex === shot.shotIndex);
                if (!dbShot) continue;

                const r2Key = `shows/${parentDoc.id}/scene_${dbScene.id}_shot_${dbShot.id}.mp4`;
                const jobMetadata = {
                    docId: parentDoc.id,
                    sceneId: dbScene.id,
                    shotId: dbShot.id,
                    title: parentDoc.title,
                    episodeNumber: ep.episodeNumber,
                    shotIndex: shot.shotIndex,
                    sourceApp: "Film Factory Studio",
                    model: videoModel || "wan2.3",
                    voiceEngine: voiceEngine || "cosyvoice2",
                    r2Key
                };

                const genJob = await prisma.genJob.create({
                    data: {
                        documentaryId: parentDoc.id,
                        jobType: "shot_video",
                        prompt: shot.kinematicPrompt || shot.actionDescription,
                        status: "QUEUED",
                        shotId: dbShot.id,
                        metadata: jobMetadata as any
                    }
                });

                await dispatchJob({
                    jobId: genJob.id,
                    documentaryId: parentDoc.id,
                    type: "shot_video",
                    prompt: shot.kinematicPrompt || shot.actionDescription,
                    referenceImages: [],
                    metadata: jobMetadata
                });
                dispatchedJobs.push(genJob);
            }
        }

        return NextResponse.json({
            success: true,
            showId: parentDoc.id,
            title: parentDoc.title,
            dispatchedJobsCount: dispatchedJobs.length,
            show: showResult
        });
    } catch (err: any) {
        console.error("[Shows API] Failed to generate show:", err);
        return NextResponse.json({ error: "Failed to generate show", details: err.message }, { status: 500 });
    }
}
