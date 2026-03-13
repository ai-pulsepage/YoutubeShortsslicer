import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadBufferToR2, getR2PublicUrl } from "@/lib/storage";

/**
 * POST /api/podcast/characters/voice-ref
 *
 * Upload a voice reference audio file (WAV/MP3) for a character.
 * Stores in R2 at: podcast-voices/{characterId}/reference.{ext}
 * Updates the character's voiceRefPath field.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const characterId = formData.get("characterId") as string;
  const file = formData.get("file") as File;

  if (!characterId || !file) {
    return NextResponse.json({ error: "characterId and file are required" }, { status: 400 });
  }

  // Verify ownership
  const character = await (prisma as any).podcastCharacter.findFirst({
    where: { id: characterId, userId: session.user.id },
  });
  if (!character) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }

  // Validate file type
  const allowedTypes = ["audio/wav", "audio/wave", "audio/x-wav", "audio/mpeg", "audio/mp3"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({
      error: `Invalid file type: ${file.type}. Use WAV or MP3.`,
    }, { status: 400 });
  }

  // Validate file size (max 10MB — 10s of audio is typically 1-3MB)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return NextResponse.json({ error: "File too large — max 10MB" }, { status: 400 });
  }

  // Read file buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Determine extension
  const ext = file.type.includes("wav") ? "wav" : "mp3";

  // Upload to R2
  const r2Key = `podcast-voices/${characterId}/reference.${ext}`;
  await uploadBufferToR2(buffer, r2Key, file.type);

  // Update character with R2 path
  await (prisma as any).podcastCharacter.update({
    where: { id: characterId },
    data: { voiceRefPath: r2Key },
  });

  const publicUrl = getR2PublicUrl(r2Key);

  console.log(`[Voice Ref] Uploaded ${file.name} (${(file.size / 1024).toFixed(0)}KB) for ${character.name} → ${r2Key}`);

  return NextResponse.json({
    success: true,
    r2Key,
    publicUrl,
    character: character.name,
    fileSize: file.size,
    format: ext,
  });
}

/**
 * DELETE /api/podcast/characters/voice-ref?characterId=xxx
 *
 * Remove voice reference for a character.
 */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const characterId = req.nextUrl.searchParams.get("characterId");
  if (!characterId) {
    return NextResponse.json({ error: "characterId required" }, { status: 400 });
  }

  const character = await (prisma as any).podcastCharacter.findFirst({
    where: { id: characterId, userId: session.user.id },
  });
  if (!character) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }

  await (prisma as any).podcastCharacter.update({
    where: { id: characterId },
    data: { voiceRefPath: null },
  });

  return NextResponse.json({ success: true });
}
