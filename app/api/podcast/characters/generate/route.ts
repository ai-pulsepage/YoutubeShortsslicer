import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * POST /api/podcast/characters/generate
 *
 * AI Personality Generator — uses DeepSeek to auto-create character personas
 * based on the show concept. Returns suggested characters with all fields pre-filled.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    showName,
    showDescription,
    topics,
    characterCount = 3,
    contentFilter = "MODERATE",
  } = await req.json();

  if (!showName) {
    return NextResponse.json({ error: "showName required" }, { status: 400 });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DEEPSEEK_API_KEY not configured" }, { status: 500 });
  }

  const prompt = `You are a podcast character designer. Given a show concept, create ${characterCount} distinct podcast characters that would create compelling, entertaining dynamics together.

SHOW: "${showName}"
${showDescription ? `DESCRIPTION: ${showDescription}` : ""}
${topics ? `TOPICS: ${Array.isArray(topics) ? topics.join(", ") : topics}` : ""}
CONTENT FILTER: ${contentFilter}

RULES:
- Each character must have a DISTINCT archetype — never repeat the same archetype
- At least one character should be the HOST
- Characters should create natural tension, disagreement, and entertainment
- Core beliefs and hot buttons should be specific and opinionated, not generic
- Political leanings should be diverse to create debate
- ${contentFilter === "UNHINGED" ? "Be bold, controversial, and push boundaries" : contentFilter === "FAMILY_FRIENDLY" ? "Keep everything PG, wholesome, and constructive" : "Be opinionated but not extreme"}

AVAILABLE ARCHETYPES (pick from these ONLY):
- FIREBRAND: Attacks everything, never backs down
- PROVOCATEUR: Says most inflammatory version of every take
- BULLDOZER: Repeats point louder, ignores counterarguments
- SNIPER: Silent then drops devastating one-liners
- PROFESSOR: Cites studies, condescends when misunderstood
- PHILOSOPHER: Zooms out to "what does this MEAN"
- ANALYST: Data-obsessed, rejects anecdotes
- SKEPTIC: Questions everything, never commits
- COMEDIAN: Turns everything into a bit
- STORYTELLER: Answers with personal anecdotes
- WILDCARD_PERSONALITY: Unpredictable, contradicts self
- HYPE_MAN: Gets EXCITED about everything
- MEDIATOR: Finds common ground, eventually snaps
- DEVILS_ADVOCATE: Takes opposite position to test arguments
- EMPATH: Responds to emotion, disarms aggression
- ELDER: Decades of experience, calm authority

AVAILABLE GENERATIONS:
- SILENT (born 1928-1945)
- BOOMER (born 1946-1964)
- GEN_X (born 1965-1980)
- MILLENNIAL (born 1981-1996)
- GEN_Z (born 1997-2012)
- GEN_ALPHA (born 2013-2025)

AVAILABLE ROLES:
- HOST (main anchor)
- GUEST (regular panelist)
- WILDCARD (unpredictable guest)

AVAILABLE IMAGE MODELS:
- FLUX (clean, editorial — for intellectual/diplomatic)
- CHROMA (edgy, stylized — for aggressive/entertainer)
- JUGGERNAUT (photorealistic — for sniper/storyteller/elder)

Return a JSON array of ${characterCount} characters. Each character must have:
{
  "name": "Creative full name",
  "role": "HOST|GUEST|WILDCARD",
  "archetype": "ONE_OF_THE_ABOVE",
  "generation": "ONE_OF_THE_ABOVE",
  "imageModel": "FLUX|CHROMA|JUGGERNAUT",
  "politicalLeaning": "Specific political worldview",
  "religiousView": "Specific religious/spiritual stance",
  "coreBeliefs": ["3-5 specific beliefs they never abandon"],
  "hotButtons": ["3-5 specific topics that trigger them"]
}

Return ONLY the JSON array, no explanation.`;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a creative podcast character designer. Return only valid JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 1.0,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} — ${err}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    // Parse JSON from response (handle markdown code blocks)
    let characters;
    try {
      const jsonStr = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      characters = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({
        error: "Failed to parse AI response",
        raw: content,
      }, { status: 500 });
    }

    // Validate and sanitize
    const validArchetypes = [
      "FIREBRAND", "PROVOCATEUR", "BULLDOZER", "SNIPER",
      "PROFESSOR", "PHILOSOPHER", "ANALYST", "SKEPTIC",
      "COMEDIAN", "STORYTELLER", "WILDCARD_PERSONALITY", "HYPE_MAN",
      "MEDIATOR", "DEVILS_ADVOCATE", "EMPATH", "ELDER",
    ];
    const validGenerations = ["SILENT", "BOOMER", "GEN_X", "MILLENNIAL", "GEN_Z", "GEN_ALPHA"];
    const validRoles = ["HOST", "GUEST", "WILDCARD"];

    const sanitized = characters.map((c: any) => ({
      name: c.name || "Unnamed Character",
      role: validRoles.includes(c.role) ? c.role : "GUEST",
      archetype: validArchetypes.includes(c.archetype) ? c.archetype : "ANALYST",
      generation: validGenerations.includes(c.generation) ? c.generation : "MILLENNIAL",
      imageModel: ["FLUX", "CHROMA", "JUGGERNAUT"].includes(c.imageModel) ? c.imageModel : "FLUX",
      politicalLeaning: c.politicalLeaning || null,
      religiousView: c.religiousView || null,
      coreBeliefs: Array.isArray(c.coreBeliefs) ? c.coreBeliefs : [],
      hotButtons: Array.isArray(c.hotButtons) ? c.hotButtons : [],
    }));

    return NextResponse.json({
      characters: sanitized,
      showName,
      characterCount: sanitized.length,
    });
  } catch (err: any) {
    console.error("[Character Generate]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
