import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateEpisodeScript } from "@/lib/podcast/script-generator";

// POST /api/podcast/scripts — Generate script for an episode
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { episodeId } = await req.json();
    if (!episodeId) {
      return NextResponse.json({ error: "episodeId required" }, { status: 400 });
    }

    const script = await generateEpisodeScript(episodeId, session.user.id);

    return NextResponse.json({
      success: true,
      lineCount: script.segments.reduce((s, seg) => s + seg.lines.length, 0),
      estimatedDuration: script.totalEstimatedDuration,
      segments: script.segments.map((s) => ({
        type: s.type,
        topic: s.topicTitle,
        lineCount: s.lines.length,
      })),
    });
  } catch (err: any) {
    console.error("[PODCAST SCRIPT]", err);
    return NextResponse.json(
      { error: err.message || "Script generation failed" },
      { status: 500 }
    );
  }
}

// GET /api/podcast/scripts?episodeId=xxx — Get saved script
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const episodeId = req.nextUrl.searchParams.get("episodeId");
  if (!episodeId) {
    return NextResponse.json({ error: "episodeId required" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");
  const episode = await prisma.podcastEpisode.findUnique({
    where: { id: episodeId },
    include: {
      show: { select: { userId: true } },
    },
  });

  if (!episode || episode.show.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!episode.scriptJson) {
    return NextResponse.json({ script: null, status: episode.status });
  }

  return NextResponse.json({
    script: typeof episode.scriptJson === "string"
      ? JSON.parse(episode.scriptJson)
      : episode.scriptJson,
    status: episode.status,
  });
}
