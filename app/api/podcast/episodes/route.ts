import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/podcast/episodes?showId=xxx — List episodes for a show
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const showId = req.nextUrl.searchParams.get("showId");
  if (!showId) {
    return NextResponse.json({ error: "showId required" }, { status: 400 });
  }

  // Verify show ownership
  const show = await prisma.podcastShow.findFirst({
    where: { id: showId, userId: session.user.id },
  });
  if (!show) {
    return NextResponse.json({ error: "Show not found" }, { status: 404 });
  }

  const episodes = await prisma.podcastEpisode.findMany({
    where: { showId },
    orderBy: { createdAt: "desc" },
    include: {
      segments: { orderBy: { order: "asc" } },
      participants: { include: { character: true } },
    },
  });

  return NextResponse.json(episodes);
}

// POST /api/podcast/episodes — Create a new episode with segments
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { showId, title, durationMin, participantIds, segments } = body;

  if (!showId) {
    return NextResponse.json({ error: "showId required" }, { status: 400 });
  }

  // Verify show ownership
  const show = await prisma.podcastShow.findFirst({
    where: { id: showId, userId: session.user.id },
    include: { hosts: true },
  });
  if (!show) {
    return NextResponse.json({ error: "Show not found" }, { status: 404 });
  }

  // Auto-assign next episode number
  const lastEp = await prisma.podcastEpisode.findFirst({
    where: { showId },
    orderBy: { episodeNumber: "desc" },
  });
  const nextNumber = (lastEp?.episodeNumber || 0) + 1;

  // Get host IDs from show
  const hostCharIds = show.hosts.map((h) => h.characterId);
  const allParticipantIds = [
    ...new Set([...hostCharIds, ...(participantIds || [])]),
  ];

  const episode = await prisma.podcastEpisode.create({
    data: {
      showId,
      episodeNumber: nextNumber,
      title: title || `Episode ${nextNumber}`,
      durationMin: durationMin || show.defaultDurationMin,
      status: "DRAFT",
      // Create participants
      participants: {
        create: allParticipantIds.map((cid: string) => ({
          characterId: cid,
        })),
      },
      // Create segments if provided
      segments: segments?.length
        ? {
            create: segments.map(
              (
                seg: {
                  type: string;
                  durationMin?: number;
                  topicTitle?: string;
                  topicContent?: string;
                  sourceUrls?: string[];
                  sourceMode?: string;
                  sponsorId?: string;
                },
                i: number
              ) => ({
                order: i + 1,
                type: seg.type || "TOPIC",
                durationMin: seg.durationMin || 10,
                topicTitle: seg.topicTitle || null,
                topicContent: seg.topicContent || null,
                sourceUrls: seg.sourceUrls || [],
                sourceMode: seg.sourceMode || "MANUAL_PREMISE",
                sponsorId: seg.sponsorId || null,
              })
            ),
          }
        : {
            // Default: intro → single topic → outro
            create: [
              { order: 1, type: "INTRO", durationMin: 2 },
              {
                order: 2,
                type: "TOPIC",
                durationMin: (durationMin || show.defaultDurationMin) - 4,
                topicTitle: title || "Open Discussion",
              },
              { order: 3, type: "OUTRO", durationMin: 2 },
            ],
          },
    },
    include: {
      segments: { orderBy: { order: "asc" } },
      participants: { include: { character: true } },
    },
  });

  return NextResponse.json(episode, { status: 201 });
}

// PUT /api/podcast/episodes?id=xxx — Update an episode
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Episode ID required" }, { status: 400 });
  }

  // Verify ownership through show
  const episode = await prisma.podcastEpisode.findFirst({
    where: { id },
    include: { show: true },
  });
  if (!episode || episode.show.userId !== session.user.id) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  const body = await req.json();
  const { title, durationMin, status } = body;

  const updated = await prisma.podcastEpisode.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(durationMin !== undefined && { durationMin }),
      ...(status !== undefined && { status }),
    },
    include: {
      segments: { orderBy: { order: "asc" } },
      participants: { include: { character: true } },
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/podcast/episodes?id=xxx — Delete an episode
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Episode ID required" }, { status: 400 });
  }

  const episode = await prisma.podcastEpisode.findFirst({
    where: { id },
    include: { show: true },
  });
  if (!episode || episode.show.userId !== session.user.id) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  await prisma.podcastEpisode.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
