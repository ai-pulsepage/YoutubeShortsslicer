import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateCinematicShow } from "@/lib/film/film-script-engine";
import { dispatchJob } from "@/lib/documentary/redis-client";

async function processShowGenerationInBackground(params: {
    docId: string;
    title: string;
    concept: string;
    genre: any;
    subStyle: any;
    numEpisodes: number;
    targetEpisodeMinutes: number;
    videoModel: string;
    voiceEngine: string;
}) {
    try {
        const { docId, title, concept, genre, subStyle, numEpisodes, targetEpisodeMinutes, videoModel, voiceEngine } = params;

        // 1. Generate full Multi-Episode Series using Cinematic Film Script Engine
        const showResult = await generateCinematicShow({
            title,
            concept,
            genre: genre || "dystopian_scifi",
            subStyle: subStyle || "default",
            numEpisodes: numEpisodes || 3,
            targetEpisodeMinutes: targetEpisodeMinutes || 3,
            videoModel: videoModel || "wan2.3",
            voiceEngine: voiceEngine || "cosyvoice2",
        });

        // 2. Save script, scenes, shots, and cast assets in database
        await prisma.documentary.update({
            where: { id: docId },
            data: {
                title: `${showResult.showTitle} (Mini-Series)`,
                genre: showResult.genre,
                subStyle: showResult.subStyle,
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

        // Query updated documentary with relations
        const updatedDoc = await prisma.documentary.findUnique({
            where: { id: docId },
            include: {
                scenes: { include: { shots: { orderBy: { shotIndex: "asc" } } } },
                assets: true
            }
        });
        if (!updatedDoc) return;

        // 3. Dispatch character reference image jobs
        for (const asset of updatedDoc.assets) {
            const assetPrompt = `Master character portrait, close-up face shot of ${asset.label}: ${asset.description}. 8k resolution, crisp facial details, cinematic lighting.`;
            const imageMetadata = {
                docId: updatedDoc.id,
                assetId: asset.id,
                characterName: asset.label,
                sourceApp: "Film Factory Studio",
                model: "flux_pro"
            };

            const assetJob = await prisma.genJob.create({
                data: {
                    documentaryId: updatedDoc.id,
                    jobType: "ref_image",
                    prompt: assetPrompt,
                    status: "QUEUED",
                    metadata: imageMetadata as any
                }
            });

            await dispatchJob({
                jobId: assetJob.id,
                documentaryId: updatedDoc.id,
                type: "ref_image",
                prompt: assetPrompt,
                referenceImages: [],
                metadata: imageMetadata
            });
        }

        // 4. Set project status to SCENES_PLANNED (Do NOT auto-queue video jobs to GPU)
        await prisma.documentary.update({
            where: { id: docId },
            data: { status: "SCENES_PLANNED" }
        });
    } catch (err: any) {
        console.error("[Shows API] Background generation failed:", err);
        await prisma.documentary.update({
            where: { id: params.docId },
            data: { status: "FAILED" }
        }).catch(() => {});
    }
}

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { title, concept, genre, subStyle, numEpisodes, targetEpisodeMinutes, videoModel, voiceEngine } = await req.json();

    if (!title || !concept) {
        return NextResponse.json({ error: "title and concept are required" }, { status: 400 });
    }

    try {
        // Create initial placeholder project immediately
        const initialDoc = await prisma.documentary.create({
            data: {
                userId: session.user.id,
                title: `${title} (Mini-Series)`,
                genre: genre || "romance_telenovela",
                subStyle: subStyle || "default",
                visualMode: "full_ai_video",
                status: "GENERATING",
                rawArticles: {
                    videoModel: videoModel || "wan2.3",
                    voiceEngine: voiceEngine || "cosyvoice2",
                    numEpisodes: parseInt(numEpisodes) || 3,
                    targetEpisodeMinutes: parseInt(targetEpisodeMinutes) || 3
                }
            }
        });

        // Trigger background processing asynchronously (non-blocking)
        processShowGenerationInBackground({
            docId: initialDoc.id,
            title,
            concept,
            genre: genre || "romance_telenovela",
            subStyle: subStyle || "default",
            numEpisodes: parseInt(numEpisodes) || 3,
            targetEpisodeMinutes: parseInt(targetEpisodeMinutes) || 3,
            videoModel: videoModel || "wan2.3",
            voiceEngine: voiceEngine || "cosyvoice2"
        }).catch(err => console.error("Background task launch error:", err));

        // Return showId immediately so the frontend navigates without waiting
        return NextResponse.json({
            success: true,
            showId: initialDoc.id,
            message: "Show creation launched in background"
        });
    } catch (error: any) {
        console.error("[Shows API] Failed to initiate show:", error);
        return NextResponse.json({ error: error.message || "Failed to create show" }, { status: 500 });
    }
}
