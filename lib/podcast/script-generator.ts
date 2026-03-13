/**
 * Podcast Script Generator
 *
 * Takes episode data (segments, characters, topics) and generates
 * multi-character dialogue scripts.
 *
 * Routing:
 *   PRIMARY:  Push job to Redis → RunPod Mistral-Large worker
 *   FALLBACK: DeepSeek API (uses existing DEEPSEEK_API_KEY env var)
 *
 * Pipeline:
 *   1. Load episode + characters + show config
 *   2. Build character personality prompts (from archetypes.ts)
 *   3. Dispatch to RunPod OR generate locally via DeepSeek
 *   4. Save full script to episode record
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
  provider?: "mistral" | "deepseek",
  onProgress?: (msg: string) => void
): Promise<PodcastScript | { dispatched: true; message: string }> {
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
  const hostChars = episode.show.hosts.map((h: any) => h.character);
  const guestChars = episode.participants
    .map((p: any) => p.character)
    .filter((c: any) => !hostChars.some((h: any) => h.id === c.id));
  const allChars = [...hostChars, ...guestChars];

  if (allChars.length === 0) throw new Error("No characters assigned");

  log(`Generating script for "${episode.title || `Ep ${episode.episodeNumber}`}" with ${allChars.length} characters`);

  // 3. Build character prompts
  const characterProfiles = allChars.map((c: any) => ({
    id: c.id,
    name: c.name,
    role: hostChars.some((h: any) => h.id === c.id) ? "HOST" : "GUEST",
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

  // 4. Route based on UI toggle
  log(`Provider received: "${provider}" | REDIS_URL set: ${!!process.env.REDIS_URL}`);
  const useRunPod = provider === "mistral" && process.env.REDIS_URL;

  if (useRunPod) {
    log("Dispatching to RunPod Mistral worker...");
    await dispatchToRunPod(episode, characterProfiles, process.env.REDIS_URL!);

    // Mark as in-progress
    await prisma.podcastEpisode.update({
      where: { id: episodeId },
      data: { status: "SCRIPTING" },
    });

    return { dispatched: true, message: "Job sent to RunPod — script will arrive via webhook" };
  }

  if (provider === "mistral" && !process.env.REDIS_URL) {
    throw new Error("Mistral selected but REDIS_URL is not configured. Set REDIS_URL or switch to DeepSeek.");
  }

  // DeepSeek — only if explicitly selected via the toggle
  log("Using DeepSeek API...");
  return generateWithDeepSeek(episode, characterProfiles, episodeId, log);
}

// ─── RunPod Dispatch ────────────────────────────────────

async function dispatchToRunPod(
  episode: any,
  characters: { id: string; name: string; role: string; prompt: string }[],
  redisUrl: string
) {
  const { getRedis } = await import("@/lib/documentary/redis-client");
  const redis = getRedis();

  const job = {
    jobId: `podcast_${episode.id}_${Date.now()}`,
    episodeId: episode.id,
    showName: episode.show.name,
    episodeTitle: episode.title || `Episode ${episode.episodeNumber}`,
    contentFilter: episode.show.contentFilter,
    characters,
    segments: episode.segments.map((s: any) => ({
      segmentId: s.id,
      type: s.type,
      topicTitle: s.topicTitle,
      topicContent: s.topicContent,
      sourceUrls: s.sourceUrls || [],
      sourceMode: s.sourceMode,
      durationMin: s.durationMin,
      sponsorId: s.sponsorId,
    })),
  };

  await redis.lpush("podcast_jobs", JSON.stringify(job));
  console.log(`[PODCAST] Job ${job.jobId} pushed to Redis queue`);
}

// ─── DeepSeek Fallback (segment-by-segment) ─────────────

async function generateWithDeepSeek(
  episode: any,
  characterProfiles: { id: string; name: string; role: string; prompt: string }[],
  episodeId: string,
  log: (msg: string) => void
): Promise<PodcastScript> {
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
          episode.segments.filter((s: any) => s.type === "TOPIC").map((s: any) => s.topicTitle || ""),
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

  // Build final script
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

  // Save script to DB and update status
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

export async function generateIntro(
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

  const systemPrompt = `You are writing a podcast intro. This is the OPENING of the show — it sets the ENTIRE tone.

The host is ${host.name}. They MUST open in character — not generic "welcome to the show" energy.

${host.prompt}

GUESTS ON THIS EPISODE:
${guests.map((g) => `- ${g.name}: ${g.prompt.split('\n')[0] || 'Guest'}`).join("\n")}

TOPICS FOR THIS EPISODE:
${topicTitles.map((t) => `- ${t}`).join("\n")}

CONTENT FILTER: ${filterNote}

STRUCTURE YOUR INTRO LIKE THIS:
1. HOOK — The host opens with something attention-grabbing. A provocative question, a sharp observation, a joke, or a bold statement that sets the tone. NOT "Welcome to the show." The host's archetype drives this.
2. SELF-INTRO — The host introduces themselves briefly, in character. An Elder might say "I've been doing this longer than most of you have been alive." A Firebrand might say "You know who I am, and you know I don't hold back."
3. GUEST INTROS — The host introduces each guest with a one-liner that references their personality or dynamic with the host. "Joining me is [name], who thinks everything I say is wrong — and I love him for it."
4. TOPIC PREVIEW — Frame what's coming, with attitude. Not just listing topics — hook the audience into WHY these topics matter today.

OUTPUT FORMAT — respond with ONLY a JSON array of dialogue lines:
[
  { "speaker": "${host.name}", "characterId": "${host.id}", "text": "...", "emotion": "excited" }
]

Write 4-8 lines. ALL lines from the HOST. Natural, conversational, IN CHARACTER.
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

  // Target ~150 words per minute of speech
  const totalTargetWords = durationMin * 150;

  const characterBlock = characters
    .map((c) => `=== ${c.name} (${c.role}) ===\n${c.prompt}`)
    .join("\n\n");

  // ─── Define natural conversation beats ─────────────────
  // Each beat mirrors how real debates flow organically

  const beats = [
    {
      name: "Opening Takes",
      fraction: 0.2,
      instruction: `ROUND 1 — OPENING TAKES
Each character states their initial position on the topic. The host frames the question, then each guest gives their raw first take.
- The host should pose the topic with attitude, not neutrally
- Each guest opens with their strongest, most confident position
- Early disagreement should be visible but not yet explosive
- Characters should reference their worldview (political leaning, generational perspective)
- This is laying groundwork — plant seeds that will explode later`,
    },
    {
      name: "Challenge & Push Back",
      fraction: 0.25,
      instruction: `ROUND 2 — CHALLENGES & PUSH BACK
Characters directly attack each other's opening positions. The gloves start coming off.
- Characters should QUOTE what someone just said and tear it apart
- Use specific counter-examples, data, or experience to challenge
- The host should take sides here — they're not neutral
- Characters should interrupt, cut each other off mid-thought
- Include moments of "Wait, wait, wait — are you seriously saying..."
- Cross-talk and overlapping reactions`,
    },
    {
      name: "Personal Stories & Anecdotes",
      fraction: 0.2,
      instruction: `ROUND 3 — PERSONAL STORIES & ANECDOTES
Characters get personal. They share stories from their own experience that support their position.
- Characters should tell SHORT but vivid personal anecdotes: "I remember when..." "My uncle was a..." "I saw this firsthand when..."
- Anecdotes should be tied to their GENERATIONAL CONTEXT and CORE BELIEFS
- Other characters should react emotionally to the stories — agreement, disbelief, or "That's exactly the problem!"
- This round humanizes the debate — it's not just abstract talking points anymore
- The host might share their own experience that surprises the guests`,
    },
    {
      name: "Escalation & Hot Buttons",
      fraction: 0.2,
      instruction: `ROUND 4 — ESCALATION & HOT BUTTONS
Someone hits a nerve. The debate gets genuinely heated.
- A character should accidentally or deliberately trigger another character's HOT BUTTON topic
- Emotional intensity increases — raised voices, personal attacks, "You don't know what you're talking about!"
- Characters abandon their polished arguments and speak from raw emotion
- Someone says something that genuinely shocks the room
- The host should try to control it but also be affected themselves
- Include at least one moment of uncomfortable silence after a bomb drops`,
    },
    {
      name: "Landing & Final Words",
      fraction: 0.15,
      instruction: `ROUND 5 — LANDING & FINAL WORDS
The debate winds down. Not everyone agrees, but positions have shifted.
- The host pulls things together with a closing observation
- Each character gets one final word — their "hill to die on" take
- Someone might concede a small point — "Look, you're not WRONG about that part, but..."
- End with tension still in the air — NOT a neat resolution
- The audience should feel like this debate could keep going
- The host transitions out with something like "We could go all night on this, but..."`,
    },
  ];

  // ─── Generate each round, feeding context forward ────────
  const allLines: DialogueLine[] = [];
  let conversationSoFar = "";

  for (const beat of beats) {
    const roundTargetWords = Math.round(totalTargetWords * beat.fraction);
    const roundTargetLines = Math.max(6, Math.round(roundTargetWords / 25)); // ~25 words per line

    const contextBlock = conversationSoFar
      ? `\nCONVERSATION SO FAR (continue from here, do NOT repeat):\n${conversationSoFar}\n`
      : "";

    const systemPrompt = `You are writing part of a podcast debate segment. Write ONLY this round of the conversation.

CHARACTERS:
${characterBlock}

TOPIC: ${topicTitle}
${topicContent ? `CONTEXT: ${topicContent}` : ""}

CONTENT FILTER: ${filterNote}

${beat.instruction}
${contextBlock}

TARGET: Write ~${roundTargetLines} dialogue lines (~${roundTargetWords} words). Each line should be a FULL thought — not one-word reactions. Average 20-35 words per line. If someone is telling a story, that line can be 40-60 words.

CRITICAL RULES:
1. Characters MUST stay in their archetype personality throughout
2. Every line must have a real "speaker" name from the character list — NEVER "Unknown"
3. Lines should be SUBSTANTIAL — full sentences, not "Yeah" or "Right" alone
4. The conversation should flow NATURALLY — people react to what was JUST said
5. Include natural speech patterns: false starts, self-corrections, trailing off...

OUTPUT: JSON array ONLY:
[
  { "speaker": "CharacterName", "characterId": "charId", "text": "...", "emotion": "angry" }
]

Emotions: "neutral", "excited", "amused", "serious", "angry", "sarcastic", "concerned", "passionate", "dismissive", "shocked"`;

    const userPrompt = sourceUrls.length > 0
      ? `Generate ROUND: ${beat.name} for topic "${topicTitle}"\n\nSOURCE ARTICLES:\n${sourceUrls.map((u) => `- ${u}`).join("\n")}`
      : `Generate ROUND: ${beat.name} for topic "${topicTitle}"`;

    try {
      const roundLines = await callLLMForDialogue(systemPrompt, userPrompt);
      allLines.push(...roundLines);

      // Build context of what's been said for the next round
      conversationSoFar += roundLines
        .map((l) => `${l.speaker}: ${l.text}`)
        .join("\n") + "\n";

      console.log(`[PODCAST] Beat "${beat.name}": ${roundLines.length} lines, ~${roundLines.reduce((s, l) => s + (l.text?.split(/\s+/).length || 0), 0)} words`);
    } catch (err: any) {
      console.error(`[PODCAST] Beat "${beat.name}" failed: ${err.message}`);
      // Continue with other beats — partial dialogue is better than none
    }
  }

  const totalWords = allLines.reduce((s, l) => s + (l.text?.split(/\s+/).length || 0), 0);
  console.log(`[PODCAST] Topic "${topicTitle}" complete: ${allLines.length} lines, ~${totalWords} words, ~${Math.round(totalWords / 150)} min estimated`);

  return allLines;
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

export async function generateOutro(
  characters: { id: string; name: string; role: string; prompt: string }[],
  showName: string,
  contentFilter: string
): Promise<DialogueLine[]> {
  const host = characters.find((c) => c.role === "HOST") || characters[0];
  const guests = characters.filter((c) => c.role === "GUEST");

  const filterNote = contentFilter === "FAMILY_FRIENDLY"
    ? "Keep language completely clean."
    : contentFilter === "MODERATE"
    ? "Light profanity allowed but not excessive."
    : "No content restrictions. Raw, unfiltered language is fine.";

  const systemPrompt = `You are writing a podcast outro. The host ${host.name} wraps up the show.

${host.prompt}

GUESTS: ${guests.map((g) => g.name).join(", ")}

CONTENT FILTER: ${filterNote}

STRUCTURE:
1. CLOSING THOUGHT — The host reflects on what was discussed. Not a summary — a personal take or observation that only THIS host would make. An Elder might say "I've seen this story before, and it never ends well." A Comedian might say "If we can't laugh at this, we're already dead."
2. GUEST ACKNOWLEDGMENT — Brief, in-character. Thank the guests the way this host would.
3. TEASE — Hint at next time or make a recurring sign-off.
4. SIGN-OFF — The host's signature closing line. Make it memorable and consistent.

ALL lines MUST have "speaker": "${host.name}" — never "Unknown".

OUTPUT: JSON array of dialogue lines. 3-5 lines, brief, natural, IN CHARACTER.
Emotions: "neutral", "excited", "amused", "serious", "sarcastic"`;

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
