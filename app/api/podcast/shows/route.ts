import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/podcast/shows — List user's shows with host/guest info
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shows = await prisma.podcastShow.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      hosts: { include: { character: true } },
      defaultGuests: { include: { character: true } },
      _count: { select: { episodes: true } },
    },
  });

  return NextResponse.json(shows);
}

// POST /api/podcast/shows — Create a new show
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    name,
    description,
    showFormat,
    contentFilter,
    defaultDurationMin,
    hostIds,
    defaultGuestIds,
    jinglePrompt,
    language,
  } = body;

  if (!name) {
    return NextResponse.json({ error: "Show name is required" }, { status: 400 });
  }

  const show = await prisma.podcastShow.create({
    data: {
      userId: session.user.id,
      name,
      description: description || null,
      showFormat: showFormat || "HOST_PLUS_GUESTS",
      contentFilter: contentFilter || "UNHINGED",
      defaultDurationMin: defaultDurationMin || 30,
      jinglePrompt: jinglePrompt || null,
      language: language || "en",
      // Create host join entries
      hosts: hostIds?.length
        ? { create: hostIds.map((cid: string) => ({ characterId: cid })) }
        : undefined,
      // Create default guest join entries
      defaultGuests: defaultGuestIds?.length
        ? { create: defaultGuestIds.map((cid: string) => ({ characterId: cid })) }
        : undefined,
    },
    include: {
      hosts: { include: { character: true } },
      defaultGuests: { include: { character: true } },
    },
  });

  return NextResponse.json(show, { status: 201 });
}

// PUT /api/podcast/shows?id=xxx — Update a show
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Show ID required" }, { status: 400 });
  }

  const existing = await prisma.podcastShow.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Show not found" }, { status: 404 });
  }

  const body = await req.json();
  const {
    name,
    description,
    showFormat,
    contentFilter,
    defaultDurationMin,
    coverArtUrl,
    jingleUrl,
    jinglePrompt,
    spotifyRssUrl,
    language,
    hostIds,
    defaultGuestIds,
  } = body;

  // Update show fields
  const show = await prisma.podcastShow.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(showFormat !== undefined && { showFormat }),
      ...(contentFilter !== undefined && { contentFilter }),
      ...(defaultDurationMin !== undefined && { defaultDurationMin }),
      ...(coverArtUrl !== undefined && { coverArtUrl }),
      ...(jingleUrl !== undefined && { jingleUrl }),
      ...(jinglePrompt !== undefined && { jinglePrompt }),
      ...(spotifyRssUrl !== undefined && { spotifyRssUrl }),
      ...(language !== undefined && { language }),
    },
  });

  // Update host assignments if provided
  if (hostIds !== undefined) {
    await prisma.podcastShowHost.deleteMany({ where: { showId: id } });
    if (hostIds.length > 0) {
      await prisma.podcastShowHost.createMany({
        data: hostIds.map((cid: string) => ({ showId: id, characterId: cid })),
      });
    }
  }

  // Update default guest assignments if provided
  if (defaultGuestIds !== undefined) {
    await prisma.podcastShowGuest.deleteMany({ where: { showId: id } });
    if (defaultGuestIds.length > 0) {
      await prisma.podcastShowGuest.createMany({
        data: defaultGuestIds.map((cid: string) => ({ showId: id, characterId: cid })),
      });
    }
  }

  // Return with relations
  const updated = await prisma.podcastShow.findUnique({
    where: { id },
    include: {
      hosts: { include: { character: true } },
      defaultGuests: { include: { character: true } },
      _count: { select: { episodes: true } },
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/podcast/shows?id=xxx — Delete a show
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Show ID required" }, { status: 400 });
  }

  const existing = await prisma.podcastShow.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Show not found" }, { status: 404 });
  }

  await prisma.podcastShow.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
