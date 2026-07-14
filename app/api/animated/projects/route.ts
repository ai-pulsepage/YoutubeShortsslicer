import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRedis, CHANNELS } from "@/lib/documentary/redis-client";
import { organizeCompletedJobAsset } from "@/lib/documentary/asset-organizer";
import { moveR2Object } from "@/lib/storage";

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const redis = getRedis();

        // 1. Drain pending finished task results from Redis to update PostgreSQL states
        for (let i = 0; i < 50; i++) {
            const result = await redis.rpop(CHANNELS.DOCUMENTARY_RESULTS);
            if (!result) break;

            try {
                const data = JSON.parse(result);
                const jobId = data.jobId;
                const status = data.status === "completed" ? "COMPLETED" : "FAILED";
                let outputPath = data.outputPath || null;
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
                }
            } catch (err) {
                console.error("[GET Projects Sync] Error processing result:", err);
            }
        }

        // 2. Retroactive sync check: find all COMPLETED GenJobs and link them if not done yet
        try {
            const completedJobs = await prisma.genJob.findMany({
                where: {
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

                    if (targetScene) {
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
            console.error("[GET Projects Sync] Retroactive link check failed:", retroErr);
        }

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
        const mapped = projects.map(p => {
            const metaConfig = (p.rawArticles && typeof p.rawArticles === "object")
                ? (p.rawArticles as Record<string, any>)
                : {};
            
            return {
                id: p.id,
                title: p.title,
                script: p.script,
                status: p.status,
                finalVideoPath: p.finalVideoPath,
                sourceUrls: p.sourceUrls || [],
                targetDuration: p.totalDuration || 2.0,
                defaultShotDuration: metaConfig.defaultShotDuration || 5,
                compositionMode: metaConfig.compositionMode || "spin_off",
                includeMusicals: metaConfig.includeMusicals !== false,
                visualStyle: metaConfig.visualStyle || "Pixar 3D",
                targetAge: metaConfig.targetAge || "Kids",
                genre: metaConfig.genre || "Adventure",
                characters: p.assets.map(a => ({
                    id: a.id,
                    name: a.label,
                    prompt: a.prompt || "",
                    imagePath: a.imagePath || ""
                })),
                scenes: p.scenes.map(s => {
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
            };
        });

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
                
                await prisma.docAsset.upsert({
                    where: { id: isTempId ? "dummy-non-matching-id" : char.id },
                    update: {
                        label: char.name,
                        prompt: char.prompt,
                        imagePath: char.imagePath || null
                    },
                    create: {
                        documentaryId: activeId,
                        type: "CHARACTER",
                        label: char.name,
                        prompt: char.prompt,
                        imagePath: char.imagePath || null
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
                const isTempId = s.id.startsWith("scene-");
                const finalSceneId = isTempId ? `scene-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}` : s.id;

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
                        console.error("[Save Project] Failed to relocate Suno file:", err.message);
                    }
                }

                const serializedMeta = JSON.stringify({
                    visualPrompt: s.visualPrompt,
                    character: s.character,
                    voice: s.voice,
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
