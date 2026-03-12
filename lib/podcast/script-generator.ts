/**
 * Podcast Script Generator
 *
 * Takes episode data (segments, characters, topics) and generates
 * multi-character dialogue scripts using DeepSeek / Gemini.
 *
 * Pipeline:
 *   1. Load episode + characters + show config
 *   2. Build character personality prompts (from archetypes.ts)
 *   3. For each TOPIC segment → generate dialogue chunk
 *   4. For INTRO/OUTRO → generate host monologue
 *   5. For AD_BREAK → generate host-read ad copy
 *   6. Save full script to episode record
 */

import { prisma } from "@/lib/prisma";
import { buildCharacterPrompt } from "@/lib/podcast/archetypes";
import type { Archetype, Generation } from "@prisma/client";

// ─── Types ──────────────────────────────────────────────

export interface DialogueLine {
  speaker: string;
  characterId: string;
  text: string;
  emotion?: string; // for TTS modulation
  duration?: number; // estimated seconds
}

export interface ScriptSegment {
  segmentId: string;
  type: string;
  topicTitle: string | null;
  lines: DialogueLine[];
}

export interface PodcastScript {
  episodeId: string;
  showName: string;
  episodeTitle: string;
  totalEstimatedDuration: number;
  segments: ScriptSegment[];
}

// ─── Script Generation ──────────────────────────────────

export async function generateEpisodeScript(
  episodeId: string,
  userId: string,
  onProgress?: (msg: string) => void
): Promise<PodcastScript> {
  const log = (msg: string) => {
    console.log(`[PODCAST] ${msg}`);
    onProgress?.(msg);
  };

  // 1. Load episode with all relations
  const episode = await prisma.podcastEpisode.findUnique({
    where: { id: episodeId },
    include: {
      show: {
        include: {
          hosts: { include: { character: true } },
        },
      },
      segments: { orderBy: { order: "asc" } },
      participants: { include: { character: true } },
    },
  });

  if (!episode) throw new Error("Episode not found");
  if (episode.show.userId !== userId) throw new Error("Unauthorized");

  // 2. Gather characters
  const hostChars = episode.show.hosts.map((h) => h.character);
  const guestChars = episode.participants
    .map((p) => p.character)
    .filter((c) => !hostChars.some((h) => h.id === c.id));
  const allChars = [...hostChars, ...guestChars];

  if (allChars.length === 0) throw new Error("No characters assigned");

  log(`Generating script for "${episode.title || `Ep ${episode.episodeNumber}`}" with ${allChars.length} characters`);

  // 3. Build character prompts
  const characterProfiles = allChars.map((c) => ({
    id: c.id,
    name: c.name,
    role: hostChars.some((h) => h.id === c.id) ? "HOST" : "GUEST",
    prompt: buildCharacterPrompt({
      name: c.name,
      archetype: c.archetype as Archetype,
      generation: c.generation as Generation,
      politicalLeaning: c.politicalLeaning,
      religiousView: c.religiousView,
      coreBeliefs: (c.coreBeliefs as string[]) || [],
      hotButtons: (c.hotButtons as string[]) || [],
    }),
  }));

  // 4. Generate each segment
  const scriptSegments: ScriptSegment[] = [];
  const contentFilter = episode.show.contentFilter;

  for (const seg of episode.segments) {
    log(`Segment ${seg.order + 1}: ${seg.type} — ${seg.topicTitle || "untitled"}`);

    let lines: DialogueLine[];

    switch (seg.type) {
      case "INTRO":
        lines = await generateIntro(
          characterProfiles,
          episode.title || `Episode ${episode.episodeNumber}`,
          episode.show.name,
          episode.segments.filter((s) => s.type === "TOPIC").map((s) => s.topicTitle || ""),
          contentFilter
        );
        break;

      case "TOPIC":
        lines = await generateTopicDialogue(
          characterProfiles,
          seg.topicTitle || "Open Discussion",
          seg.topicContent || "",
          (seg.sourceUrls as string[]) || [],
          seg.sourceMode,
          seg.durationMin,
          contentFilter
        );
        break;

      case "AD_BREAK":
        lines = await generateAdBreak(
          characterProfiles.filter((c) => c.role === "HOST"),
          seg.sponsorId ? await getSponsorData(seg.sponsorId) : null
        );
        break;

      case "OUTRO":
        lines = await generateOutro(
          characterProfiles,
          episode.show.name,
          contentFilter
        );
        break;

      default:
        lines = [];
    }

    scriptSegments.push({
      segmentId: seg.id,
      type: seg.type,
      topicTitle: seg.topicTitle,
      lines,
    });
  }

  // 5. Build final script
  const script: PodcastScript = {
    episodeId,
    showName: episode.show.name,
    episodeTitle: episode.title || `Episode ${episode.episodeNumber}`,
    totalEstimatedDuration: scriptSegments.reduce(
      (sum, seg) => sum + seg.lines.reduce((s, l) => s + (l.duration || 5), 0),
      0
    ),
    segments: scriptSegments,
  };

  // 6. Save script to DB and update status
  await prisma.podcastEpisode.update({
    where: { id: episodeId },
    data: {
      scriptJson: JSON.stringify(script) as any,
      status: "SCRIPTING",
    },
  });

  log(`Script complete — ${scriptSegments.reduce((s, seg) => s + seg.lines.length, 0)} total lines`);

  return script;
}

// ─── Segment Generators ─────────────────────────────────

async function generateIntro(
  characters: { id: string; name: string; role: string; prompt: string }[],
  episodeTitle: string,
  showName: string,
  topicTitles: string[],
  contentFilter: string
): Promise<DialogueLine[]> {
  const host = characters.find((c) => c.role === "HOST") || characters[0];
  const guests = characters.filter((c) => c.role === "GUEST");

  const filterNote = contentFilter === "FAMILY_FRIENDLY"
    ? "Keep language completely clean."
    : contentFilter === "MODERATE"
    ? "Light profanity allowed but not excessive."
    : "No content restrictions. Raw, unfiltered language is fine.";

  const systemPrompt = `You are writing a podcast script. Write ONLY the intro segment.
The host ${host.name} opens the show, welcomes listeners, introduces today's guests, and previews the topics.

${host.prompt}

GUESTS ON THIS EPISODE:
${guests.map((g) => `- ${g.name}`).join("\n")}

TOPICS FOR THIS EPISODE:
${topicTitles.map((t) => `- ${t}`).join("\n")}

CONTENT FILTER: ${filterNote}

OUTPUT FORMAT — respond with ONLY a JSON array of dialogue lines:
[
  { "speaker": "${host.name}", "characterId": "${host.id}", "text": "...", "emotion": "excited" }
]

Keep it 3-6 lines. Natural, conversational. The host should be IN CHARACTER per their archetype.
Emotions: "neutral", "excited", "amused", "serious", "angry", "sarcastic", "concerned"`;

  return callLLMForDialogue(systemPrompt, `Write the intro for "${showName}" episode "${episodeTitle}".`);
}

async function generateTopicDialogue(
  characters: { id: string; name: string; role: string; prompt: string }[],
  topicTitle: string,
  topicContent: string,
  sourceUrls: string[],
  sourceMode: string,
  durationMin: number,
  contentFilter: string
): Promise<DialogueLine[]> {
  const filterNote = contentFilter === "FAMILY_FRIENDLY"
    ? "Keep language completely clean."
    : contentFilter === "MODERATE"
    ? "Light profanity allowed but not excessive."
    : "No content restrictions. Raw, unfiltered language is fine. Characters can swear, be crass, use slang.";

  // Target ~15 words per second of speech, ~150 words per minute
  const targetWordCount = durationMin * 150;
  const targetLines = Math.max(8, Math.round(durationMin * 5));

  const characterBlock = characters
    .map((c) => `=== ${c.name} (${c.role}) ===\n${c.prompt}`)
    .join("\n\n");

  const systemPrompt = `You are a podcast script writer. Write a HEATED, NATURAL debate segment between these characters.

CHARACTERS:
${characterBlock}

RULES:
1. Characters MUST stay in their archetype. Bulldozers steamroll. Skeptics question. Mediators try to find common ground.
2. Characters MUST argue from their worldview — political leaning, religious views, generational perspective.
3. Characters MUST hit each other's hot buttons when the topic allows it.
4. Include interruptions, talking over each other, emotional escalation, and moments of surprising agreement.
5. This is NOT a polite panel discussion. This is a REAL argument between people with strong opinions.
6. Include at least one moment where a character says something that genuinely surprises the others.
7. Hosts should moderate but also have their own opinions — they're not neutral.
8. Guests should push back against the host when they disagree.

CONTENT FILTER: ${filterNote}

TARGET: ~${targetLines} lines, ~${targetWordCount} words total. Duration target: ${durationMin} minutes.

OUTPUT FORMAT — respond with ONLY a JSON array:
[
  { "speaker": "CharacterName", "characterId": "charId", "text": "...", "emotion": "angry" },
  { "speaker": "CharacterName", "characterId": "charId", "text": "...", "emotion": "sarcastic" }
]

Emotions: "neutral", "excited", "amused", "serious", "angry", "sarcastic", "concerned", "passionate", "dismissive", "shocked"
Do NOT include stage directions or action descriptions. Only spoken dialogue.`;

  let userPrompt = `TOPIC: ${topicTitle}\n`;
  if (topicContent) {
    userPrompt += `\nPREMISE/CONTEXT:\n${topicContent}\n`;
  }
  if (sourceUrls.length > 0) {
    userPrompt += `\nSOURCE ARTICLES (summarize and reference during debate):\n${sourceUrls.map((u) => `- ${u}`).join("\n")}\n`;
  }
  userPrompt += `\nGenerate the debate segment now. Make it HEATED and REAL.`;

  return callLLMForDialogue(systemPrompt, userPrompt);
}

async function generateAdBreak(
  hosts: { id: string; name: string; role: string; prompt: string }[],
  sponsor: { brandName: string; tagline: string | null; promoCode: string | null; promoUrl: string | null; talkingPoints: string[]; adStyle: string } | null
): Promise<DialogueLine[]> {
  const host = hosts[0];
  if (!host) return [];

  if (!sponsor) {
    return [{
      speaker: host.name,
      characterId: host.id,
      text: "We'll be right back after a quick break.",
      emotion: "neutral",
      duration: 3,
    }];
  }

  const systemPrompt = `You are writing a podcast ad read. The host ${host.name} reads an ad for ${sponsor.brandName}.

${host.prompt}

AD STYLE: ${sponsor.adStyle}
- CASUAL: Natural mid-conversation mention, like the host genuinely uses the product
- SCRIPTED: Clean, professional read  
- TESTIMONIAL: Host shares personal experience with the product
- HARD_SELL: Direct sales pitch with urgency

SPONSOR INFO:
- Brand: ${sponsor.brandName}
- Tagline: ${sponsor.tagline || "N/A"}
- Promo Code: ${sponsor.promoCode || "N/A"}
- URL: ${sponsor.promoUrl || "N/A"}
- Talking Points: ${sponsor.talkingPoints.join(", ") || "N/A"}

OUTPUT: JSON array of 2-4 dialogue lines for the ad read. Keep it natural to the host's character.
The host should deliver the ad IN CHARACTER — a Bulldozer host does a Bulldozer ad read.`;

  return callLLMForDialogue(systemPrompt, `Write the ${sponsor.adStyle} ad read for ${sponsor.brandName}.`);
}

async function generateOutro(
  characters: { id: string; name: string; role: string; prompt: string }[],
  showName: string,
  contentFilter: string
): Promise<DialogueLine[]> {
  const host = characters.find((c) => c.role === "HOST") || characters[0];

  const systemPrompt = `You are writing a podcast outro. The host ${host.name} wraps up the show.

${host.prompt}

Write 2-4 lines where the host thanks the guests, teases next episode, and signs off.
Stay in character. A Comedian host signs off with a joke. A Mediator reflects on what was learned.

OUTPUT: JSON array of dialogue lines. Keep it brief and natural.`;

  return callLLMForDialogue(systemPrompt, `Write the outro for "${showName}".`);
}

// ─── LLM Call ───────────────────────────────────────────

async function callLLMForDialogue(
  systemPrompt: string,
  userPrompt: string
): Promise<DialogueLine[]> {
  try {
    return await callDeepSeek(systemPrompt, userPrompt);
  } catch (err: any) {
    console.warn(`[PODCAST] DeepSeek failed, trying Gemini: ${err.message}`);
    return callGemini(systemPrompt, userPrompt);
  }
}

async function callDeepSeek(
  systemPrompt: string,
  userPrompt: string
): Promise<DialogueLine[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const apiBase = process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com";
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not configured");

  const res = await fetch(`${apiBase}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.85,
      max_tokens: 8192,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek error: ${res.status} — ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty DeepSeek response");

  return parseDialogueLines(content);
}

async function callGemini(
  systemPrompt: string,
  userPrompt: string
): Promise<DialogueLine[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: `${systemPrompt}\n\n---\n\n${userPrompt}` }],
          },
        ],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error: ${res.status} — ${err}`);
  }

  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("Empty Gemini response");

  return parseDialogueLines(content);
}

// ─── Helpers ────────────────────────────────────────────

function parseDialogueLines(raw: string): DialogueLine[] {
  let parsed: any;

  try {
    parsed = JSON.parse(raw);
  } catch {
    // Try extracting JSON array from markdown fences or wrapped response
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      console.error("[PODCAST] Failed to parse dialogue:", raw.substring(0, 500));
      throw new Error("Could not parse LLM dialogue response");
    }
  }

  // Handle response wrapped in object
  if (parsed && !Array.isArray(parsed)) {
    if (parsed.lines) parsed = parsed.lines;
    else if (parsed.dialogue) parsed = parsed.dialogue;
    else if (parsed.script) parsed = parsed.script;
    else parsed = Object.values(parsed)[0];
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Dialogue response is not an array");
  }

  return parsed.map((line: any) => ({
    speaker: line.speaker || "Unknown",
    characterId: line.characterId || line.character_id || "",
    text: line.text || line.dialogue || "",
    emotion: line.emotion || "neutral",
    duration: estimateDuration(line.text || ""),
  }));
}

function estimateDuration(text: string): number {
  // ~150 words per minute = ~2.5 words per second
  const words = text.split(/\s+/).length;
  return Math.max(2, Math.round(words / 2.5));
}

async function getSponsorData(sponsorId: string) {
  const sponsor = await prisma.podcastSponsor.findUnique({
    where: { id: sponsorId },
  });
  if (!sponsor) return null;
  return {
    brandName: sponsor.brandName,
    tagline: sponsor.tagline,
    promoCode: sponsor.promoCode,
    promoUrl: sponsor.promoUrl,
    talkingPoints: (sponsor.talkingPoints as string[]) || [],
    adStyle: sponsor.adStyle,
  };
}
