/**
 * Documentary CRUD API
 * 
 * GET  /api/documentary         — List all documentaries (with filters)
 * POST /api/documentary         — Create new documentary project
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const where: any = {
        userId: session.user.id,
        genre: { notIn: ["children", "children_library", "ugc_vault"] }
    };
    if (status) {
        where.status = status;
    }

    const documentaries = await prisma.documentary.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
            _count: {
                select: {
                    scenes: true,
                    assets: true,
                    genJobs: true,
                },
            },
        },
    });

    return NextResponse.json(documentaries);
}

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { sourceUrls, voiceId, title, genre, subStyle, audience, perspective,
        pacing, ending, endingNote, contentMode, musicMood,
        useBRoll, useKenBurns, visualMode, imageModel, narratorStyle, ttsEngine, textStory,
        targetDurationMinutes } = body;

    // In topic mode, sourceUrls can be empty if title is provided.
    // In textStory mode, sourceUrls can also be empty.
    const isTopicMode = (!sourceUrls || sourceUrls.length === 0) && title && !textStory;
    const isTextMode = !!textStory;
    if (!isTopicMode && !isTextMode && (!sourceUrls || !Array.isArray(sourceUrls) || sourceUrls.length === 0)) {
        return NextResponse.json(
            { error: "Provide a topic title, a story text, OR at least one source URL" },
            { status: 400 }
        );
    }

    const documentary = await prisma.documentary.create({
        data: {
            userId: session.user.id,
            title: title || (textStory ? "Custom Story Script" : null),
            sourceUrls: sourceUrls || [],
            rawArticles: textStory ? [
                {
                    url: "user-text",
                    title: title || "User Story Script",
                    summary: textStory,
                    keyFacts: [],
                    scientificConcepts: [],
                    quotes: [],
                    emotionalHooks: [],
                    noveltyScore: 10
                }
            ] : undefined,
            genre: genre || "science",
            subStyle: subStyle || "bbc_earth",
            audience: audience || "adults",
            perspective: perspective || "omniscient",
            pacing: pacing || "standard",
            ending: ending || "ai_decide",
            endingNote: endingNote || null,
            contentMode: contentMode || "creative",
            musicMood: musicMood || "ambient",
            useBRoll: useBRoll ?? true,
            useKenBurns: useKenBurns ?? true,
            visualMode: visualMode || "broll_only",
            imageModel: imageModel || "chroma",
            voiceId: voiceId || "Rachel",
            narratorStyle: narratorStyle || "sleep",
            ttsEngine: ttsEngine || "elevenlabs",
            targetDurationMinutes: parseInt(targetDurationMinutes) || 15,
            status: "DRAFT",
        },
    });

    return NextResponse.json(documentary);
}
