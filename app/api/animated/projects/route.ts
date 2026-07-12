import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
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
                compositionMode: metaConfig.compositionMode || "spin_off",
                includeMusicals: metaConfig.includeMusicals !== false,
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

    const { id, title, script, characters, scenes, sourceUrls, targetDuration, compositionMode, includeMusicals } = await req.json();

    try {
        let activeId = id;
        const configMeta = {
            compositionMode: compositionMode || "spin_off",
            includeMusicals: includeMusicals !== false
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

                const serializedMeta = JSON.stringify({
                    visualPrompt: s.visualPrompt,
                    character: s.character,
                    voice: s.voice,
                    type: s.type,
                    sunoStylePrompt: s.sunoStylePrompt || "",
                    visualShots: s.visualShots || [],
                    sunoAudioKey: s.sunoAudioKey || ""
                });

                await prisma.docScene.create({
                    data: {
                        id: isTempId ? undefined : s.id,
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
                compositionMode: metaConfig.compositionMode || "spin_off",
                includeMusicals: metaConfig.includeMusicals !== false,
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
