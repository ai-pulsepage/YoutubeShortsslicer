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
import { scrapeArticles } from "@/lib/documentary/scraper";
import { generateStoryScript, saveScriptToDocumentary } from "@/lib/documentary/story-writer";
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

    // Run the pipeline in the background (don't block the HTTP response)
    runStoryPipeline(id, documentary.sourceUrls, documentary.style, targetDuration).catch(
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
    style: string,
    targetDuration: number
): Promise<void> {
    console.log(`[StoryPipeline] Starting for ${documentaryId}...`);

    // Step 1: Scrape articles
    console.log(`[StoryPipeline] Step 1/3: Scraping ${sourceUrls.length} articles...`);
    const articles = await scrapeArticles(sourceUrls);

    if (articles.length === 0) {
        throw new Error("No articles could be scraped from the provided URLs");
    }

    // Save raw articles to documentary
    await prisma.documentary.update({
        where: { id: documentaryId },
        data: { rawArticles: JSON.parse(JSON.stringify(articles)) },
    });

    // Step 2: Generate script
    console.log(`[StoryPipeline] Step 2/3: Writing ${targetDuration}-min script...`);
    const script = await generateStoryScript(articles, targetDuration);
    await saveScriptToDocumentary(documentaryId, script);

    // Step 3: Plan scenes + shots
    console.log(`[StoryPipeline] Step 3/3: Planning scenes and shots...`);
    await planScenes(documentaryId, script, style);

    // Update status to SCENES_PLANNED on success
    await prisma.documentary.update({
        where: { id: documentaryId },
        data: { status: "SCENES_PLANNED" },
    });

    console.log(`[StoryPipeline] ✅ Complete for ${documentaryId}`);
}
