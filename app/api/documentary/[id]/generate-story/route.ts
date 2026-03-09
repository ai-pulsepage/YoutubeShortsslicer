/**
 * Generate Story API
 * 
 * POST /api/documentary/[id]/generate-story
 * 
 * Triggers the full story generation pipeline:
 * 1. Scrape source article URLs
 * 2. Generate narrated script via DeepSeek
 * 3. Plan scenes + shots (AI Filmmaker)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scrapeArticles, researchTopic } from "@/lib/documentary/scraper";
import { generateStoryScript, saveScriptToDocumentary, type GenreConfig } from "@/lib/documentary/story-writer";
import { planScenes } from "@/lib/documentary/scene-planner";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const documentary = await prisma.documentary.findUnique({
        where: { id, userId: session.user.id },
    });

    if (!documentary) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Optional body params
    const body = await req.json().catch(() => ({}));
    const targetDuration = body.targetDurationMinutes || 30;

    // Set status to GENERATING immediately so the UI shows progress
    await prisma.documentary.update({
        where: { id },
        data: { status: "GENERATING", errorMsg: null },
    });

    // Determine mode: topic-based (no URLs) or URL-based
    const isTopicMode = documentary.sourceUrls.length === 0 && !!documentary.title;

    // Build genre config from documentary record
    const genreConfig: GenreConfig = {
        genre: documentary.genre,
        subStyle: documentary.subStyle,
        audience: documentary.audience,
        perspective: documentary.perspective,
        pacing: documentary.pacing,
        ending: documentary.ending,
        endingNote: documentary.endingNote,
        contentMode: documentary.contentMode,
    };

    // Run the pipeline in the background (don't block the HTTP response)
    runStoryPipeline(
        id,
        documentary.sourceUrls,
        genreConfig,
        targetDuration,
        isTopicMode ? documentary.title! : undefined
    ).catch(
        async (err) => {
            console.error(`[GenerateStory] Pipeline failed for ${id}:`, err);
            await prisma.documentary.update({
                where: { id },
                data: { status: "FAILED", errorMsg: String(err) },
            }).catch(() => { });
        }
    );

    return NextResponse.json({
        message: "Story generation started",
        documentaryId: id,
        status: "GENERATING",
    });
}

async function runStoryPipeline(
    documentaryId: string,
    sourceUrls: string[],
    genreConfig: GenreConfig,
    targetDuration: number,
    topicTitle?: string
): Promise<void> {
    const styleLabel = `${genreConfig.genre}/${genreConfig.subStyle}`;
    console.log(`[StoryPipeline] Starting for ${documentaryId} (${styleLabel})...`);

    // Fetch current state to determine what's already done
    const current = await prisma.documentary.findUnique({
        where: { id: documentaryId },
        include: { scenes: { take: 1 } },
    });

    let articles;
    let script;

    // ── Step 1: Research / Scrape ─────────────────────────
    if (current?.rawArticles && Array.isArray(current.rawArticles) && (current.rawArticles as any[]).length > 0) {
        articles = current.rawArticles as any[];
        console.log(`[StoryPipeline] Step 1/3: ⏩ Skipping research (${articles.length} articles already saved)`);
    } else {
        if (topicTitle) {
            console.log(`[StoryPipeline] Step 1/3: AI researching topic "${topicTitle}"...`);
            articles = await researchTopic(topicTitle);
        } else {
            console.log(`[StoryPipeline] Step 1/3: Scraping ${sourceUrls.length} articles...`);
            articles = await scrapeArticles(sourceUrls);
        }

        if (articles.length === 0) {
            throw new Error(topicTitle
                ? "AI could not generate research for this topic. Try a more specific title."
                : "No articles could be scraped from the provided URLs");
        }

        await prisma.documentary.update({
            where: { id: documentaryId },
            data: { rawArticles: JSON.parse(JSON.stringify(articles)) },
        });
    }

    // ── Step 2: Generate Script ───────────────────────────
    if (current?.script && current.script.length > 50) {
        console.log(`[StoryPipeline] Step 2/3: ⏩ Skipping script (already generated)`);
        // Script is stored as formatted text, reconstruct a minimal StoryScript
        const segments = current.script.split("\n\n").filter(Boolean).map((block: string) => {
            const tsMatch = block.match(/^\[([^\]]+)\]\s*([\s\S]*)/);
            const visualMatch = block.match(/\[VISUAL:\s*(.*)\]/);
            return {
                timestamp: tsMatch?.[1] || "00:00",
                narration: tsMatch?.[2]?.replace(/\n\[VISUAL:.*\]/, "").trim() || block,
                visualCue: visualMatch?.[1] || "Documentary footage",
            };
        });
        script = {
            title: current.title || "Untitled",
            segments,
            estimatedDurationMinutes: (current.totalDuration || 1800) / 60,
        };
    } else {
        console.log(`[StoryPipeline] Step 2/3: Writing ${targetDuration}-min ${styleLabel} script...`);
        script = await generateStoryScript(articles, targetDuration, genreConfig);
        await saveScriptToDocumentary(documentaryId, script);
    }

    // ── Step 3: Plan Scenes + Shots ──────────────────────
    console.log(`[StoryPipeline] Step 3/3: Planning scenes and shots...`);
    await planScenes(documentaryId, script, `${genreConfig.genre} ${genreConfig.subStyle}`);

    // Update status to SCENES_PLANNED on success
    await prisma.documentary.update({
        where: { id: documentaryId },
        data: { status: "SCENES_PLANNED" },
    });

    console.log(`[StoryPipeline] ✅ Complete for ${documentaryId}`);
}
