import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/podcast/webhook
 * Receives completed script results from the RunPod podcast worker.
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
      // Save script and update status
      await prisma.podcastEpisode.update({
        where: { id: episodeId },
        data: {
          scriptJson: script as any,
          status: "SCRIPTING",
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
