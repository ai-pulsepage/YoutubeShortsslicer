import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRedis, CHANNELS, dispatchJob } from "@/lib/documentary/redis-client";
import { organizeCompletedJobAsset } from "@/lib/documentary/asset-organizer";
import { moveR2Object, listR2Objects, deleteMultipleFromR2 } from "@/lib/storage";

async function drainRedisResultsSafe() {
    try {
        const redis = getRedis();
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
                }
            } catch (err) {
                console.error("[Background Redis Sync] Error processing result:", err);
            }
        }
    } catch (redisErr: any) {
        console.error("[Background Redis] Connection/pop failed:", redisErr.message);
    }
}

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        // Drain pending finished task results from Redis asynchronously in the background
        drainRedisResultsSafe().catch(err => console.error("Uncaught background drain error:", err));

        const projects = await prisma.documentary.findMany({
            where: {
                userId: session.user.id,
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

        // Map database projects to client structures
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
                status: p.finalVideoPath || p.status === "APPROVED" ? "COMPLETED" : p.status,
                finalVideoPath: p.finalVideoPath,
                sourceUrls: p.sourceUrls || [],
                targetDuration: p.totalDuration || 2.0,
                defaultShotDuration: metaConfig.defaultShotDuration || 5,
                compositionMode: metaConfig.compositionMode || "spin_off",
                includeMusicals: metaConfig.includeMusicals !== false,
                visualStyle: metaConfig.visualStyle || "Pixar 3D",
                targetAge: metaConfig.targetAge || "Kids",
                genre: metaConfig.genre || "Adventure",
                visualAnalysis,
                characters: p.assets.map(a => {
                    let ttsProvider = null;
                    let ttsVoiceId = null;
                    if (a.description) {
                        try {
                            const desc = JSON.parse(a.description);
                            ttsProvider = desc.ttsProvider || null;
                            ttsVoiceId  = desc.ttsVoiceId  || null;
                        } catch {}
                    }
                    return {
                        id: a.id,
                        name: a.label,
                        prompt: a.prompt || "",
                        imagePath: a.imagePath || "",
                        ttsProvider,
                        ttsVoiceId,
                    };
                }),
                scenes: p.scenes.map(s => {
                    let character = "Leo";
                    let voice = "en-US-AnaNeural-Female";
                    let type: "dialogue" | "song" = s.sceneIndex % 3 === 2 ? "song" : "dialogue";
                    let visualPrompt = s.searchQueries || "";
                    let sunoStylePrompt = "";
                    let visualShots: any[] = [];
                    let sunoAudioKey = "";
                    let sunoDuration: number | null = null;
                    let ttsProvider: string | null = null;
                    let ttsVoiceId: string | null = null;

                    try {
                        if (s.searchQueries && s.searchQueries.startsWith("{")) {
                            const meta = JSON.parse(s.searchQueries);
                            if (meta.character) character = meta.character;
                            if (meta.voice) voice = meta.voice;
                            if (meta.type) type = meta.type;
                            if (meta.visualPrompt !== undefined) visualPrompt = meta.visualPrompt;
                            if (meta.sunoStylePrompt) sunoStylePrompt = meta.sunoStylePrompt;
                            if (meta.visualShots) visualShots = meta.visualShots;
                            if (meta.sunoAudioKey) sunoAudioKey = meta.sunoAudioKey;
                            if (meta.sunoDuration !== undefined) sunoDuration = meta.sunoDuration;
                            // TTS provider fields
                            if (meta.ttsProvider) ttsProvider = meta.ttsProvider;
                            if (meta.ttsVoiceId)  ttsVoiceId  = meta.ttsVoiceId;
                        }
                    } catch (e) {
                        console.error("JSON parse searchQueries failed:", e);
                    }

                    return {
                        id: s.id,
                        type,
                        character,
                        voice,
                        ttsProvider: ttsProvider || undefined,
                        ttsVoiceId: ttsVoiceId || undefined,
                        text: s.narrationText || "",
                        visualPrompt,
                        sunoStylePrompt,
                        visualShots,
                        sunoAudioKey: sunoAudioKey || undefined,
                        sunoDuration: sunoDuration || undefined,
                        visualPath: s.assembledPath || undefined,
                        narrationPath: s.narrationPath || undefined
                    };
                })
            };
        }));

        return NextResponse.json({ projects: mapped });

    } catch (err: any) {
        console.error("[Get Projects] Error:", err.message);
        return NextResponse.json({ error: "Failed to load projects", details: err.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, title, script, characters, scenes, sourceUrls, targetDuration, defaultShotDuration, compositionMode, includeMusicals, visualStyle, targetAge, genre } = await req.json();

    try {
        let activeId = id;
        const configMeta = {
            compositionMode: compositionMode || "spin_off",
            includeMusicals: includeMusicals !== false,
            visualStyle: visualStyle || "Pixar 3D",
            targetAge: targetAge || "Kids",
            genre: genre || "Adventure",
            defaultShotDuration: defaultShotDuration || 5
        };

        // 1. Create or Update parent Documentary Project
        if (!activeId) {
            const doc = await prisma.documentary.create({
                data: {
                    userId: session.user.id,
                    title: title || "New Kids Story Project",
                    script: script || "",
                    genre: "children",
                    status: "DRAFT",
                    sourceUrls: sourceUrls || [],
                    totalDuration: targetDuration || 2.0,
                    rawArticles: configMeta as any
                }
            });
            activeId = doc.id;
        } else {
            await prisma.documentary.update({
                where: { id: activeId },
                data: {
                    title: title,
                    script: script,
                    sourceUrls: sourceUrls || [],
                    totalDuration: targetDuration || 2.0,
                    rawArticles: configMeta as any
                }
            });
        }

        // 2. Sync character assets
        if (characters && Array.isArray(characters)) {
            const activeDbIds = characters
                .map(c => c.id)
                .filter(id => id && !id.startsWith("char-"));

            // Remove characters deleted in the frontend
            await prisma.docAsset.deleteMany({
                where: {
                    documentaryId: activeId,
                    type: "CHARACTER",
                    id: { notIn: activeDbIds }
                }
            });

            for (const char of characters) {
                const isTempId = char.id.startsWith("char-");

                let imagePath = char.imagePath || null;
                let inheritedTtsProvider = char.ttsProvider || null;
                let inheritedTtsVoiceId  = char.ttsVoiceId  || null;

                if (!imagePath || !inheritedTtsProvider) {
                    const libraryChar = await prisma.docAsset.findFirst({
                        where: {
                            type: "CHARACTER",
                            label: { equals: char.name, mode: "insensitive" },
                            documentary: {
                                userId: session.user.id,
                                genre: "children_library"
                            }
                        }
                    });
                    if (libraryChar?.imagePath && !imagePath) {
                        imagePath = libraryChar.imagePath;
                    }
                    // Pull TTS profile from library character if not already set locally
                    if (libraryChar?.description && !inheritedTtsProvider) {
                        try {
                            const libDesc = JSON.parse(libraryChar.description);
                            inheritedTtsProvider = libDesc.ttsProvider || null;
                            inheritedTtsVoiceId  = libDesc.ttsVoiceId  || null;
                        } catch {}
                    }
                }

                // Serialize TTS profile into description blob
                const charDescription = JSON.stringify({
                    ttsProvider: inheritedTtsProvider,
                    ttsVoiceId: inheritedTtsVoiceId,
                });

                await prisma.docAsset.upsert({
                    where: { id: isTempId ? "dummy-non-matching-id" : char.id },
                    update: {
                        label: char.name,
                        prompt: char.prompt,
                        imagePath: imagePath,
                        description: charDescription
                    },
                    create: {
                        documentaryId: activeId,
                        type: "CHARACTER",
                        label: char.name,
                        prompt: char.prompt,
                        imagePath: imagePath,
                        description: charDescription
                    }
                });
            }
        }

        // 3. Sync scenes timeline with JSON serialized metadata including visualShots
        if (scenes && Array.isArray(scenes)) {
            // Delete old scenes first
            await prisma.docScene.deleteMany({
                where: { documentaryId: activeId }
            });

            // Insert current scenes list
            for (let idx = 0; idx < scenes.length; idx++) {
                const s = scenes[idx];
                const finalSceneId = s.id || `scene-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`;

                // Automatically relocate custom Suno MP3 uploads from UGC folders to kids animated project folder
                let sunoAudioKey = s.sunoAudioKey || "";
                if (sunoAudioKey && sunoAudioKey.startsWith("ugc/")) {
                    const extension = sunoAudioKey.split(".").pop() || "mp3";
                    const newKey = `animated/projects/${activeId}/audio/scene_${finalSceneId}_suno.${extension}`;
                    try {
                        console.log(`[Save Project] Relocating Suno upload: ${sunoAudioKey} -> ${newKey}`);
                        await moveR2Object(sunoAudioKey, newKey);
                        sunoAudioKey = newKey;
                    } catch (err: any) {
                        // File was already moved in an earlier auto-save call — use relocated key
                        sunoAudioKey = newKey;
                    }
                }

                const serializedMeta = JSON.stringify({
                    visualPrompt: s.visualPrompt,
                    character: s.character,
                    voice: s.voice,
                    ttsProvider: s.ttsProvider || null,
                    ttsVoiceId: s.ttsVoiceId || null,
                    type: s.type,
                    sunoStylePrompt: s.sunoStylePrompt || "",
                    visualShots: s.visualShots || [],
                    sunoAudioKey: sunoAudioKey,
                    sunoDuration: s.sunoDuration !== undefined ? s.sunoDuration : null
                });

                await prisma.docScene.create({
                    data: {
                        id: finalSceneId,
                        documentaryId: activeId,
                        sceneIndex: idx,
                        title: `Scene ${idx + 1}`,
                        narrationText: s.text,
                        searchQueries: serializedMeta,
                        assembledPath: s.visualPath || null,
                        narrationPath: s.narrationPath || null
                    }
                });
            }
        }

        // Return updated project dataset
        const updated = await prisma.documentary.findUnique({
            where: { id: activeId },
            include: {
                assets: { where: { type: "CHARACTER" } },
                scenes: { orderBy: { sceneIndex: "asc" } }
            }
        });

        const metaConfig = (updated?.rawArticles && typeof updated.rawArticles === "object")
            ? (updated.rawArticles as Record<string, any>)
            : {};

        return NextResponse.json({
            success: true,
            project: {
                id: updated?.id,
                title: updated?.title,
                script: updated?.script,
                sourceUrls: updated?.sourceUrls || [],
                targetDuration: updated?.totalDuration || 2.0,
                defaultShotDuration: metaConfig.defaultShotDuration || 5,
                compositionMode: metaConfig.compositionMode || "spin_off",
                includeMusicals: metaConfig.includeMusicals !== false,
                visualStyle: metaConfig.visualStyle || "Pixar 3D",
                targetAge: metaConfig.targetAge || "Kids",
                genre: metaConfig.genre || "Adventure",
                characters: updated?.assets.map(a => ({
                    id: a.id,
                    name: a.label,
                    prompt: a.prompt || "",
                    imagePath: a.imagePath || ""
                })),
                scenes: updated?.scenes.map(s => {
                    let character = "Leo";
                    let voice = "en-US-AnaNeural-Female";
                    let type: "dialogue" | "song" = s.sceneIndex % 3 === 2 ? "song" : "dialogue";
                    let visualPrompt = s.searchQueries || "";
                    let sunoStylePrompt = "";
                    let visualShots: any[] = [];
                    let sunoAudioKey = "";
                    let sunoDuration: number | null = null;

                    try {
                        if (s.searchQueries && s.searchQueries.startsWith("{")) {
                            const meta = JSON.parse(s.searchQueries);
                            if (meta.character) character = meta.character;
                            if (meta.voice) voice = meta.voice;
                            if (meta.type) type = meta.type;
                            if (meta.visualPrompt !== undefined) visualPrompt = meta.visualPrompt;
                            if (meta.sunoStylePrompt) sunoStylePrompt = meta.sunoStylePrompt;
                            if (meta.visualShots) visualShots = meta.visualShots;
                            if (meta.sunoAudioKey) sunoAudioKey = meta.sunoAudioKey;
                            if (meta.sunoDuration !== undefined) sunoDuration = meta.sunoDuration;
                        }
                    } catch (e) {
                        console.error("JSON parse searchQueries failed:", e);
                    }

                    return {
                        id: s.id,
                        type,
                        character,
                        voice,
                        text: s.narrationText || "",
                        visualPrompt,
                        sunoStylePrompt,
                        visualShots,
                        sunoAudioKey: sunoAudioKey || undefined,
                        sunoDuration: sunoDuration || undefined,
                        visualPath: s.assembledPath || undefined,
                        narrationPath: s.narrationPath || undefined
                    };
                })
            }
        });

    } catch (err: any) {
        console.error("[Save Project] Error:", err.message);
        return NextResponse.json({ error: "Failed to save project draft", details: err.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    try {
        // 1. Delete all R2 files under this project
        try {
            console.log(`[Delete Project] Listing R2 assets for project ${id}...`);
            const prefix = `animated/projects/${id}/`;
            const objects = await listR2Objects(prefix);
            if (objects.length > 0) {
                const keys = objects.map(o => o.key);
                console.log(`[Delete Project] Deleting ${keys.length} R2 assets for project ${id}...`);
                await deleteMultipleFromR2(keys);
            }
        } catch (r2Err: any) {
            console.error(`[Delete Project] Failed to clean up R2 assets for project ${id}:`, r2Err.message);
        }

        // 2. Delete project from PostgreSQL
        await prisma.documentary.delete({
            where: {
                id,
                userId: session.user.id
            }
        });
        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("[Delete Project] Error:", err.message);
        return NextResponse.json({ error: "Failed to delete project", details: err.message }, { status: 500 });
    }
}
