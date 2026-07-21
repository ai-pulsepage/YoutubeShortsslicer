import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateCinematicShow } from "@/lib/film/film-script-engine";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { title, concept, genre, subStyle, numEpisodes, videoModel, voiceEngine } = await req.json();

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
                status: "SCENES_PLANNED",
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

        return NextResponse.json({
            success: true,
            showId: parentDoc.id,
            title: parentDoc.title,
            show: showResult
        });
    } catch (err: any) {
        console.error("[Shows API] Failed to generate show:", err);
        return NextResponse.json({ error: "Failed to generate show", details: err.message }, { status: 500 });
    }
}
