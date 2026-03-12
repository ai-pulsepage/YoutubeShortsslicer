import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/podcast/sponsors — List user's sponsors
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sponsors = await prisma.podcastSponsor.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(sponsors);
}

// POST /api/podcast/sponsors — Create a new sponsor
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    brandName,
    tagline,
    talkingPoints,
    promoCode,
    promoUrl,
    adStyle,
    adScript,
    maxDurationSec,
  } = body;

  if (!brandName) {
    return NextResponse.json({ error: "Brand name is required" }, { status: 400 });
  }

  const sponsor = await prisma.podcastSponsor.create({
    data: {
      userId: session.user.id,
      brandName,
      tagline: tagline || null,
      talkingPoints: talkingPoints || [],
      promoCode: promoCode || null,
      promoUrl: promoUrl || null,
      adStyle: adStyle || "CASUAL",
      adScript: adScript || null,
      maxDurationSec: maxDurationSec || 60,
    },
  });

  return NextResponse.json(sponsor, { status: 201 });
}

// PUT /api/podcast/sponsors?id=xxx — Update a sponsor
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Sponsor ID required" }, { status: 400 });
  }

  const existing = await prisma.podcastSponsor.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Sponsor not found" }, { status: 404 });
  }

  const body = await req.json();
  const {
    brandName,
    tagline,
    talkingPoints,
    promoCode,
    promoUrl,
    adStyle,
    adScript,
    maxDurationSec,
    active,
  } = body;

  const sponsor = await prisma.podcastSponsor.update({
    where: { id },
    data: {
      ...(brandName !== undefined && { brandName }),
      ...(tagline !== undefined && { tagline }),
      ...(talkingPoints !== undefined && { talkingPoints }),
      ...(promoCode !== undefined && { promoCode }),
      ...(promoUrl !== undefined && { promoUrl }),
      ...(adStyle !== undefined && { adStyle }),
      ...(adScript !== undefined && { adScript }),
      ...(maxDurationSec !== undefined && { maxDurationSec }),
      ...(active !== undefined && { active }),
    },
  });

  return NextResponse.json(sponsor);
}

// DELETE /api/podcast/sponsors?id=xxx — Delete a sponsor
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Sponsor ID required" }, { status: 400 });
  }

  const existing = await prisma.podcastSponsor.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Sponsor not found" }, { status: 404 });
  }

  await prisma.podcastSponsor.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
