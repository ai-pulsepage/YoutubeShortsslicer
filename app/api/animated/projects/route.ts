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
        const mapped = projects.map(p => ({
            id: p.id,
            title: p.title,
            script: p.script,
            status: p.status,
            finalVideoPath: p.finalVideoPath,
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

                try {
                    if (s.searchQueries && s.searchQueries.startsWith("{")) {
                        const meta = JSON.parse(s.searchQueries);
                        if (meta.character) character = meta.character;
                        if (meta.voice) voice = meta.voice;
                        if (meta.type) type = meta.type;
                        if (meta.visualPrompt !== undefined) visualPrompt = meta.visualPrompt;
                        if (meta.sunoStylePrompt) sunoStylePrompt = meta.sunoStylePrompt;
                        if (meta.visualShots) visualShots = meta.visualShots;
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
                    visualPath: s.assembledPath || undefined,
                    narrationPath: s.narrationPath || undefined
                };
            })
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

    const { id, title, script, characters, scenes } = await req.json();

    try {
        let activeId = id;

        // 1. Create or Update parent Documentary Project
        if (!activeId) {
            const doc = await prisma.documentary.create({
                data: {
                    userId: session.user.id,
                    title: title || "New Kids Story Project",
                    script: script || "",
                    genre: "children",
                    status: "DRAFT"
                }
            });
            activeId = doc.id;
        } else {
            await prisma.documentary.update({
                where: { id: activeId },
                data: {
                    title: title,
                    script: script
                }
            });
        }

        // 2. Upsert character assets
        if (characters && Array.isArray(characters)) {
            for (const char of characters) {
                const isTempId = char.id.startsWith("char-preset-") || char.id.startsWith("char-manual-") || char.id.length < 10;
                
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
                    visualShots: s.visualShots || []
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

        return NextResponse.json({
            success: true,
            project: {
                id: updated?.id,
                title: updated?.title,
                script: updated?.script,
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

                    try {
                        if (s.searchQueries && s.searchQueries.startsWith("{")) {
                            const meta = JSON.parse(s.searchQueries);
                            if (meta.character) character = meta.character;
                            if (meta.voice) voice = meta.voice;
                            if (meta.type) type = meta.type;
                            if (meta.visualPrompt !== undefined) visualPrompt = meta.visualPrompt;
                            if (meta.sunoStylePrompt) sunoStylePrompt = meta.sunoStylePrompt;
                            if (meta.visualShots) visualShots = meta.visualShots;
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
