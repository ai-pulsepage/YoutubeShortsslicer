import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildCharacterPrompt } from "@/lib/podcast/archetypes";
import { generateIntro, generateOutro } from "@/lib/podcast/script-generator";
import type { Archetype, Generation } from "@prisma/client";

/**
 * POST /api/podcast/webhook
 * Receives completed script results from the RunPod podcast worker.
 * Detects empty intro/outro segments and backfills via DeepSeek.
 */
export async function POST(req: NextRequest) {
  // Verify webhook secret
  const secret = req.headers.get("x-webhook-secret");
  const expectedSecret = process.env.WORKER_WEBHOOK_SECRET || "podcast-worker-secret";

  if (secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { episodeId, status, script, error } = body;

    if (!episodeId) {
      return NextResponse.json({ error: "episodeId required" }, { status: 400 });
    }

    if (status === "completed" && script) {
      // Check for empty intro/outro and backfill if needed
      const enrichedScript = await backfillIntroOutro(script, episodeId);

      // Save script and update status
      await prisma.podcastEpisode.update({
        where: { id: episodeId },
        data: {
          scriptJson: enrichedScript as any,
          status: "READY",
        },
      });
      console.log(`[PODCAST WEBHOOK] Script saved for episode ${episodeId}`);
    } else if (status === "failed") {
      // Mark episode as failed
      await prisma.podcastEpisode.update({
        where: { id: episodeId },
        data: {
          status: "FAILED_PODCAST",
          errorMsg: error || "Script generation failed on RunPod",
        },
      });
      console.error(`[PODCAST WEBHOOK] Episode ${episodeId} failed: ${error}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[PODCAST WEBHOOK] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Checks script segments for empty INTRO/OUTRO and generates them via DeepSeek.
 * Returns the enriched script with filled-in intro/outro dialogue.
 */
async function backfillIntroOutro(script: any, episodeId: string): Promise<any> {
  const segments = script?.segments || [];

  // Find segments that need content
  const introSeg = segments.find((s: any) => s.type === "INTRO");
  const outroSeg = segments.find((s: any) => s.type === "OUTRO");

  const introEmpty = introSeg && (!introSeg.lines || introSeg.lines.length === 0);
  const outroEmpty = outroSeg && (!outroSeg.lines || outroSeg.lines.length === 0);

  if (!introEmpty && !outroEmpty) {
    console.log("[PODCAST WEBHOOK] Intro/outro already have content — no backfill needed");
    return script;
  }

  console.log(`[PODCAST WEBHOOK] Backfilling: intro=${introEmpty ? "EMPTY" : "ok"}, outro=${outroEmpty ? "EMPTY" : "ok"}`);

  // Load episode data for character info
  const episode = await prisma.podcastEpisode.findUnique({
    where: { id: episodeId },
    include: {
      show: true,
      segments: { orderBy: { order: "asc" as const } },
      participants: { include: { character: true } },
    },
  });

  if (!episode) {
    console.warn("[PODCAST WEBHOOK] Episode not found for backfill — skipping");
    return script;
  }

  // Build character profiles (same as script-generator.ts)
  const allChars = episode.participants.map((p: any) => p.character);
  const hostChars = episode.participants
    .filter((p: any) => p.role === "HOST")
    .map((p: any) => p.character);

  const characterProfiles = allChars.map((c: any) => ({
    id: c.id,
    name: c.name,
    role: hostChars.some((h: any) => h.id === c.id) ? "HOST" : "GUEST",
    prompt: buildCharacterPrompt({
      name: c.name,
      archetype: c.archetype as Archetype,
      generation: c.generation as Generation,
      politicalLeaning: c.politicalLeaning,
      religiousView: c.religiousView,
      coreBeliefs: (c.coreBeliefs as string[]) || [],
      hotButtons: (c.hotButtons as string[]) || [],
    }),
  }));

  const topicTitles = episode.segments
    .filter((s: any) => s.type === "TOPIC")
    .map((s: any) => s.topicTitle || "");

  const contentFilter = (episode.show as any).contentFilter || "UNFILTERED";

  try {
    // Generate intro if empty
    if (introEmpty) {
      console.log("[PODCAST WEBHOOK] Generating intro via DeepSeek...");
      const introLines = await generateIntro(
        characterProfiles,
        episode.title || `Episode ${episode.episodeNumber}`,
        (episode.show as any).name,
        topicTitles,
        contentFilter
      );
      introSeg.lines = introLines;
      console.log(`[PODCAST WEBHOOK] Intro generated: ${introLines.length} lines`);
    }

    // Generate outro if empty
    if (outroEmpty) {
      console.log("[PODCAST WEBHOOK] Generating outro via DeepSeek...");
      const outroLines = await generateOutro(
        characterProfiles,
        (episode.show as any).name,
        contentFilter
      );
      outroSeg.lines = outroLines;
      console.log(`[PODCAST WEBHOOK] Outro generated: ${outroLines.length} lines`);
    }
  } catch (err: any) {
    console.error(`[PODCAST WEBHOOK] Backfill failed: ${err.message}`);
    // Don't fail the whole webhook — just save what we have
  }

  return script;
}
