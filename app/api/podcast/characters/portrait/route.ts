import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildCharacterPrompt } from "@/lib/podcast/archetypes";

/**
 * POST /api/podcast/characters/portrait — Generate a self-portrait for a character
 * 
 * Uses the character's personality to auto-generate an avatar prompt,
 * then dispatches to the existing RunPod image worker.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { characterId, customPrompt } = body;

  if (!characterId) {
    return NextResponse.json({ error: "characterId required" }, { status: 400 });
  }

  const character = await prisma.podcastCharacter.findFirst({
    where: { id: characterId, userId: session.user.id },
  });
  if (!character) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }

  // Build avatar prompt from personality if none provided
  let avatarPrompt = customPrompt;
  if (!avatarPrompt) {
    avatarPrompt = generateAvatarPrompt(character);
  }

  // Save the avatar prompt for future reference
  await prisma.podcastCharacter.update({
    where: { id: characterId },
    data: { avatarPrompt },
  });

  // Map image model enum to worker model name
  const modelMap: Record<string, string> = {
    FLUX: "flux",
    CHROMA: "chroma",
    JUGGERNAUT: "juggernaut",
  };
  const model = modelMap[character.imageModel] || "flux";

  // Dispatch to existing RunPod image worker via the queue
  try {
    const { addJob, waitForJobResult } = await import("@/lib/queue");

    const jobId = await addJob("runpod-worker", {
      type: "image",
      model,
      prompt: avatarPrompt,
      width: 768,
      height: 768,
      steps: 30,
      cfg: 7,
      metadata: {
        purpose: "podcast_portrait",
        characterId,
        characterName: character.name,
      },
    });

    return NextResponse.json({
      success: true,
      jobId,
      avatarPrompt,
      model,
      message: "Portrait generation queued. Check job status for result.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Failed to queue portrait job: ${error.message}` },
      { status: 500 }
    );
  }
}

/**
 * Generate an avatar prompt based on character personality.
 * The AI "describes how they want to look" based on their archetype.
 */
function generateAvatarPrompt(character: {
  name: string;
  role: string;
  archetype: string;
  generation: string;
  politicalLeaning: string | null;
}): string {
  const archetypeVisuals: Record<string, string> = {
    FIREBRAND: "intense expression, furrowed brow, strong jaw, slightly flushed complexion, wearing a crisp button-down with sleeves rolled up, dramatic lighting",
    PROVOCATEUR: "knowing smirk, raised eyebrow, confident posture, dark clothing, mischievous glint in eyes, moody lighting with shadow play",
    BULLDOZER: "stern broad-shouldered person, arms crossed, unreadable expression, casual business attire, solid and immovable presence, direct lighting",
    SNIPER: "contemplative person with sharp calculating eyes, minimal expression, dark turtleneck, clean background, noir-inspired lighting",
    PROFESSOR: "distinguished intellectual with reading glasses, tweed jacket, warm study background with books, thoughtful expression, soft warm lighting",
    PHILOSOPHER: "deep-in-thought person, slightly unkempt hair, turtleneck, abstract art background, contemplative upward gaze, diffused natural lighting",
    ANALYST: "sharp-dressed person with modern glasses, clean minimalist background, neutral confident expression, data visualizations subtly reflected, crisp lighting",
    SKEPTIC: "person with one eyebrow raised, slight head tilt, casual smart attire, plain background, expression of measured doubt, even lighting",
    COMEDIAN: "person with wide genuine grin, casual clothing, colorful background, animated expression, comedy club aesthetic, warm dynamic lighting",
    STORYTELLER: "warm approachable person, cozy sweater, coffee shop background, mid-gesture as if telling a tale, soft golden lighting",
    WILDCARD_PERSONALITY: "eccentric person with bold fashion choices, unexpected accessories, colorful hair or clothing detail, playful expression, vibrant creative lighting",
    HYPE_MAN: "extremely enthusiastic person, big smile, forward-leaning posture, bright streetwear, energetic background, vivid saturated lighting",
    MEDIATOR: "calm centered person, open body language, neutral earth-tone clothing, peaceful background, gentle knowing smile, balanced soft lighting",
    DEVILS_ADVOCATE: "person with balanced expression, one hand raised in questioning gesture, business casual, split-tone background, deliberate even lighting",
    EMPATH: "gentle warm expression, soft features, natural fabrics clothing, serene natural background, compassionate eyes, warm golden hour lighting",
    ELDER: "distinguished older person, silver hair, wisdom lines on face, classic timeless clothing, leather chair or study background, rich amber lighting",
  };

  const generationAge: Record<string, string> = {
    SILENT: "elderly person in their 80s-90s",
    BOOMER: "mature person in their 60s-70s",
    GEN_X: "middle-aged person in their 40s-50s",
    MILLENNIAL: "person in their 30s-40s",
    GEN_Z: "young person in their 20s",
    GEN_ALPHA: "young person in their late teens to early 20s",
  };

  const visual = archetypeVisuals[character.archetype] || "confident person, neutral background, professional lighting";
  const age = generationAge[character.generation] || "adult person";

  return `Portrait of a ${age}, ${visual}. High quality professional headshot, detailed face, sharp focus. Cinematic photography style.`;
}
