import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/podcast/characters — List all characters for the user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const characters = await prisma.podcastCharacter.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: {
        select: {
          showHosts: true,
          showDefaultGuests: true,
          episodeParticipants: true,
        },
      },
    },
  });

  return NextResponse.json(characters);
}

// POST /api/podcast/characters — Create a new character
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    name,
    role,
    archetype,
    generation,
    voiceId,
    speechRate,
    imageModel,
    politicalLeaning,
    religiousView,
    coreBeliefs,
    hotButtons,
  } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const character = await prisma.podcastCharacter.create({
    data: {
      userId: session.user.id,
      name,
      role: role || "GUEST",
      archetype: archetype || "ANALYST",
      generation: generation || "MILLENNIAL",
      voiceId: voiceId || null,
      speechRate: speechRate || 1.0,
      imageModel: imageModel || "FLUX",
      politicalLeaning: politicalLeaning || null,
      religiousView: religiousView || null,
      coreBeliefs: coreBeliefs || [],
      hotButtons: hotButtons || [],
    },
  });

  return NextResponse.json(character, { status: 201 });
}

// PUT /api/podcast/characters?id=xxx — Update a character
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "Character ID required" },
      { status: 400 }
    );
  }

  // Verify ownership
  const existing = await prisma.podcastCharacter.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Character not found" },
      { status: 404 }
    );
  }

  const body = await req.json();
  const {
    name,
    role,
    archetype,
    generation,
    voiceId,
    voiceRefPath,
    speechRate,
    imageModel,
    avatarUrl,
    avatarPrompt,
    politicalLeaning,
    religiousView,
    coreBeliefs,
    hotButtons,
    memoryAutoUpdate,
  } = body;

  const character = await prisma.podcastCharacter.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(role !== undefined && { role }),
      ...(archetype !== undefined && { archetype }),
      ...(generation !== undefined && { generation }),
      ...(voiceId !== undefined && { voiceId }),
      ...(voiceRefPath !== undefined && { voiceRefPath }),
      ...(speechRate !== undefined && { speechRate }),
      ...(imageModel !== undefined && { imageModel }),
      ...(avatarUrl !== undefined && { avatarUrl }),
      ...(avatarPrompt !== undefined && { avatarPrompt }),
      ...(politicalLeaning !== undefined && { politicalLeaning }),
      ...(religiousView !== undefined && { religiousView }),
      ...(coreBeliefs !== undefined && { coreBeliefs }),
      ...(hotButtons !== undefined && { hotButtons }),
      ...(memoryAutoUpdate !== undefined && { memoryAutoUpdate }),
    },
  });

  return NextResponse.json(character);
}

// DELETE /api/podcast/characters?id=xxx — Delete a character
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "Character ID required" },
      { status: 400 }
    );
  }

  // Verify ownership
  const existing = await prisma.podcastCharacter.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Character not found" },
      { status: 404 }
    );
  }

  await prisma.podcastCharacter.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
