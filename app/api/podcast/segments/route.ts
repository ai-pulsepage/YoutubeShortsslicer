import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PUT /api/podcast/segments?id=xxx — Update a segment
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Segment ID required" }, { status: 400 });
  }

  // Verify ownership through episode → show
  const segment = await prisma.episodeSegment.findFirst({
    where: { id },
    include: { episode: { include: { show: true } } },
  });
  if (!segment || segment.episode.show.userId !== session.user.id) {
    return NextResponse.json({ error: "Segment not found" }, { status: 404 });
  }

  const body = await req.json();
  const {
    type,
    durationMin,
    topicTitle,
    topicContent,
    sourceUrls,
    sourceMode,
    sponsorId,
    order,
  } = body;

  const updated = await prisma.episodeSegment.update({
    where: { id },
    data: {
      ...(type !== undefined && { type }),
      ...(durationMin !== undefined && { durationMin }),
      ...(topicTitle !== undefined && { topicTitle }),
      ...(topicContent !== undefined && { topicContent }),
      ...(sourceUrls !== undefined && { sourceUrls }),
      ...(sourceMode !== undefined && { sourceMode }),
      ...(sponsorId !== undefined && { sponsorId }),
      ...(order !== undefined && { order }),
    },
  });

  return NextResponse.json(updated);
}

// POST /api/podcast/segments — Add a segment to an episode
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { episodeId, type, durationMin, topicTitle, topicContent, sourceUrls, sourceMode, sponsorId } = body;

  if (!episodeId) {
    return NextResponse.json({ error: "episodeId required" }, { status: 400 });
  }

  // Verify ownership
  const episode = await prisma.podcastEpisode.findFirst({
    where: { id: episodeId },
    include: { show: true, segments: { orderBy: { order: "desc" }, take: 1 } },
  });
  if (!episode || episode.show.userId !== session.user.id) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  const nextOrder = (episode.segments[0]?.order || 0) + 1;

  const segment = await prisma.episodeSegment.create({
    data: {
      episodeId,
      order: nextOrder,
      type: type || "TOPIC",
      durationMin: durationMin || 10,
      topicTitle: topicTitle || null,
      topicContent: topicContent || null,
      sourceUrls: sourceUrls || [],
      sourceMode: sourceMode || "MANUAL_PREMISE",
      sponsorId: sponsorId || null,
    },
  });

  return NextResponse.json(segment, { status: 201 });
}

// DELETE /api/podcast/segments?id=xxx — Remove a segment
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Segment ID required" }, { status: 400 });
  }

  const segment = await prisma.episodeSegment.findFirst({
    where: { id },
    include: { episode: { include: { show: true } } },
  });
  if (!segment || segment.episode.show.userId !== session.user.id) {
    return NextResponse.json({ error: "Segment not found" }, { status: 404 });
  }

  await prisma.episodeSegment.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
