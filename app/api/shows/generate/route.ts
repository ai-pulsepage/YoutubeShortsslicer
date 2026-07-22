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
                    create: showResult.episodes.flatMap((ep) =>
                        ep.shots.map((shot) => ({
                            sceneIndex: (ep.episodeNumber - 1) * 10 + shot.shotIndex,
                            title: `Ep ${ep.episodeNumber} - Shot ${shot.shotIndex}`,
                            narrationText: shot.dialogueLine || shot.actionDescription,
                            searchQueries: JSON.stringify({
                                kinematicPrompt: shot.kinematicPrompt,
                                shotType: shot.shotType,
                                speakerName: shot.speakerName,
                                dialogueLine: shot.dialogueLine
                            })
                        }))
                    )
                }
            }
        });

        // 3. Auto-dispatch shot_video jobs onto Redis Queue
        const dispatchedJobs = [];
        for (const ep of showResult.episodes) {
            for (const shot of ep.shots) {
                const r2Key = `shows/${parentDoc.id}/ep_${ep.episodeNumber}_shot_${shot.shotIndex}.mp4`;
                const jobMetadata = {
                    docId: parentDoc.id,
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
                        prompt: shot.kinematicPrompt,
                        status: "QUEUED",
                        metadata: jobMetadata as any
                    }
                });

                await dispatchJob({
                    jobId: genJob.id,
                    documentaryId: parentDoc.id,
                    type: "shot_video",
                    prompt: shot.kinematicPrompt,
                    referenceImages: [],
                    metadata: jobMetadata
                });

                dispatchedJobs.push(genJob.id);
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
