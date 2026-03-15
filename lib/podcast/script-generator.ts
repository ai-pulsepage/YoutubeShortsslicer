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

  // Mark as SCRIPTING immediately so frontend can poll
  await prisma.podcastEpisode.update({
    where: { id: episodeId },
    data: { status: "SCRIPTING" },
  });

  // Fire-and-forget — generate in background, don't await
  generateWithDeepSeek(episode, characterProfiles, episodeId, log).catch(async (err) => {
    console.error(`[PODCAST] Background script generation failed: ${err.message}`);
    try {
      await prisma.podcastEpisode.update({
        where: { id: episodeId },
        data: { status: "FAILED_PODCAST" },
      });
    } catch (dbErr) {
      console.error(`[PODCAST] Failed to mark episode as FAILED_PODCAST`, dbErr);
    }
  });

  return { dispatched: true, message: "Script generation started — polling for updates" };
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

  // Track cross-topic context for natural transitions
  let topicIndex = 0;
  let previousTopicSummary = "";

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
          contentFilter,
          topicIndex,
          previousTopicSummary
        );
        // Update cross-topic context for next topic
        topicIndex++;
        const lastFewLines = lines.slice(-4).map((l) => `${l.speaker}: ${l.text}`).join("\n");
        previousTopicSummary = `Previous topic "${seg.topicTitle}" ended with:\n${lastFewLines}`;
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

  // ─── Abort check: if user reset during generation, don't overwrite ───
  const currentEp = await prisma.podcastEpisode.findUnique({
    where: { id: episodeId },
    select: { status: true },
  });
  if (currentEp && currentEp.status !== "SCRIPTING") {
    log(`Status changed to ${currentEp.status} during generation — aborting final write`);
    return script; // Return but don't save — user cancelled
  }

  // Save script to DB and mark READY
  await prisma.podcastEpisode.update({
    where: { id: episodeId },
    data: {
      scriptJson: JSON.stringify(script) as any,
      status: "READY",
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

// ─── URL Scraping ───────────────────────────────────────

async function scrapeSourceUrls(urls: string[]): Promise<string> {
  if (!urls || urls.length === 0) return "";

  const scrapedParts: string[] = [];

  for (const url of urls) {
    if (!url.trim()) continue;
    try {
      console.log(`[PODCAST] Scraping URL: ${url}`);
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PodcastResearchBot/1.0)",
          "Accept": "text/html,application/xhtml+xml,*/*",
        },
      });
      if (!res.ok) {
        console.warn(`[PODCAST] Scrape failed for ${url}: ${res.status}`);
        continue;
      }

      let html = await res.text();

      // Strip script/style tags and their content
      html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
      html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
      html = html.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
      html = html.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
      html = html.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");

      // Extract text content — strip all remaining HTML tags
      let text = html
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();

      // Truncate to ~3000 chars to avoid overwhelming the prompt
      if (text.length > 3000) {
        text = text.slice(0, 3000) + "... [truncated]";
      }

      if (text.length > 100) { // Only include if we got meaningful content
        scrapedParts.push(`=== FROM: ${url} ===\n${text}`);
        console.log(`[PODCAST] Scraped ${text.length} chars from ${url}`);
      } else {
        console.warn(`[PODCAST] Too little content scraped from ${url} (${text.length} chars)`);
      }
    } catch (err: any) {
      console.warn(`[PODCAST] Scrape error for ${url}: ${err.message}`);
    }
  }

  return scrapedParts.join("\n\n");
}

async function generateTopicDialogue(
  characters: { id: string; name: string; role: string; prompt: string }[],
  topicTitle: string,
  topicContent: string,
  sourceUrls: string[],
  sourceMode: string,
  durationMin: number,
  contentFilter: string,
  topicIndex: number = 0,
  previousTopicSummary: string = ""
): Promise<DialogueLine[]> {
  // ─── Scrape URLs for real article content ──────────────
  const scrapedContent = await scrapeSourceUrls(sourceUrls);
  const filterNote = contentFilter === "FAMILY_FRIENDLY"
    ? "Keep language completely clean."
    : contentFilter === "MODERATE"
    ? "Light profanity allowed but not excessive."
    : "No content restrictions. Raw, unfiltered language is fine. Characters can swear, be crass, use slang.";

  const totalTargetWords = durationMin * 150;

  // ─── Extract character perspective summaries for Content AI ──────
  // Pass 1 doesn't get full personality — just ideological angles
  const perspectives = characters.map((c) => {
    const lines = c.prompt.split("\n");
    const political = lines.find((l) => l.startsWith("POLITICAL WORLDVIEW:"))?.replace("POLITICAL WORLDVIEW:", "").trim() || "";
    const beliefs = lines.filter((l) => l.startsWith("- ")).map((l) => l.replace("- ", "")).join("; ");
    return {
      id: c.id,
      name: c.name,
      role: c.role,
      angle: political || beliefs || c.role,
    };
  });

  // ─── Define beats ──────────────────────────────────────────
  const beats = [
    { name: "Opening Takes", fraction: 0.2, phase: "opening" },
    { name: "Challenge & Push Back", fraction: 0.25, phase: "challenge" },
    { name: "Deep Dive & Evidence", fraction: 0.25, phase: "evidence" },
    { name: "Escalation & Hot Buttons", fraction: 0.15, phase: "escalation" },
    { name: "Landing & Final Words", fraction: 0.15, phase: "landing" },
  ];

  const allLines: DialogueLine[] = [];
  let conversationSoFar = "";

  for (const beat of beats) {
    const roundTargetWords = Math.round(totalTargetWords * beat.fraction);

    try {
      // ═══════════════════════════════════════════════════════
      // PASS 1: CONTENT AI — "The Journalist"
      // Generates raw expert-level arguments with SPECIFIC facts
      // NO character personalities — just substance from each angle
      // ═══════════════════════════════════════════════════════

      const contentPrompt = buildContentPrompt(
        topicTitle, topicContent, sourceUrls, scrapedContent, perspectives, beat, roundTargetWords, conversationSoFar,
        topicIndex, previousTopicSummary
      );

      console.log(`[PODCAST] Pass 1 (Content): ${beat.name}...`);
      const rawContent = await callDeepSeekRaw(
        contentPrompt.system,
        contentPrompt.user
      );

      // ═══════════════════════════════════════════════════════
      // PASS 2: DIRECTOR AI — "The Choreographer"
      // Takes raw content and designs the conversation FLOW
      // Uses turn-taking theory, adjacency pairs, preference org
      // ═══════════════════════════════════════════════════════

      const directorPrompt = buildDirectorPrompt(
        rawContent, characters, beat, roundTargetWords, conversationSoFar
      );

      console.log(`[PODCAST] Pass 2 (Director): ${beat.name}...`);
      const structuredFlow = await callDeepSeekRaw(
        directorPrompt.system,
        directorPrompt.user
      );

      // ═══════════════════════════════════════════════════════
      // PASS 3: VOICE AI — "The Voice Actor"
      // Takes structured conversation and translates through
      // each character's personality, intelligence level, and
      // speech patterns. Adds disfluency markers.
      // ═══════════════════════════════════════════════════════

      const voicePrompt = buildVoicePrompt(
        structuredFlow, characters, filterNote, beat
      );

      console.log(`[PODCAST] Pass 3 (Voice): ${beat.name}...`);
      const roundLines = await callLLMForDialogue(
        voicePrompt.system,
        voicePrompt.user
      );

      allLines.push(...roundLines);

      conversationSoFar += roundLines
        .map((l) => `${l.speaker}: ${l.text}`)
        .join("\n") + "\n";

      const wordCount = roundLines.reduce((s, l) => s + (l.text?.split(/\s+/).length || 0), 0);
      console.log(`[PODCAST] Beat "${beat.name}": ${roundLines.length} lines, ~${wordCount} words (3-pass)`);
    } catch (err: any) {
      console.error(`[PODCAST] Beat "${beat.name}" failed: ${err.message}`);
    }
  }

  const totalWords = allLines.reduce((s, l) => s + (l.text?.split(/\s+/).length || 0), 0);
  console.log(`[PODCAST] Topic "${topicTitle}" complete: ${allLines.length} lines, ~${totalWords} words, ~${Math.round(totalWords / 150)} min estimated`);

  return allLines;
}

// ═══════════════════════════════════════════════════════════════
// THREE-PASS PROMPT BUILDERS
// ═══════════════════════════════════════════════════════════════

function buildContentPrompt(
  topicTitle: string,
  topicContent: string,
  sourceUrls: string[],
  scrapedContent: string,
  perspectives: { id: string; name: string; role: string; angle: string }[],
  beat: { name: string; phase: string },
  targetWords: number,
  conversationSoFar: string,
  topicIndex: number = 0,
  previousTopicSummary: string = ""
): { system: string; user: string } {

  const phaseInstructions: Record<string, string> = {
    opening: `PHASE: OPENING TAKES
Generate each perspective's initial position on the topic.
- Each perspective should lead with their STRONGEST, most specific argument
- Include at least one SPECIFIC fact per perspective (a name, date, statistic, event, or policy)
- One perspective should make a claim that will be difficult for the others to counter
- Plant 2-3 factual seeds that will be developed deeper in later rounds
- Don't just state opinions — provide the REASONING and EVIDENCE behind each position`,

    challenge: `PHASE: CHALLENGES & PUSH BACK
Generate direct challenges to the positions stated in the conversation so far.
- Each challenge must ADDRESS A SPECIFIC CLAIM from the conversation — quote it or paraphrase it
- Provide counter-evidence: opposing statistics, historical counter-examples, logical flaws
- Include at least one "drill-down moment" — one perspective spends 3-4 sentences explaining a specific aspect in granular detail (e.g. the timeline of Iran's enrichment program, specific trade agreement clauses, specific policy outcomes with numbers)
- Some challenges should be strong, others should be partial agreements that pivot to a different point
- Include evidence that is genuinely hard to dismiss`,

    evidence: `PHASE: DEEP DIVE & EVIDENCE
Generate the most substantive part of the debate — this is where real depth happens.
- Each perspective provides their MOST DETAILED, SPECIFIC arguments
- Include extended explanations: a perspective spends 4-6 sentences on ONE specific sub-topic with real facts, names, dates, and numbers
- Include a moment where one perspective brings up something the others hadn't considered — a genuinely new angle
- One perspective should cite a specific historical parallel with DETAIL (not just "it happened before")
- Include a sub-point where two perspectives partially agree on a specific fact but disagree on its interpretation
- This round should contain the HIGHEST density of specific facts in the entire topic`,

    escalation: `PHASE: ESCALATION & HOT BUTTONS
Generate the emotional peak of the debate.
- One perspective pushes a point that hits the others personally — not just intellectually
- Include a provocative claim that is partially true but framed in the most inflammatory way
- One perspective should oversimplify a complex issue deliberately to make a emotional point
- Include a moment of genuine moral/ethical disagreement — not just policy disagreement
- One perspective should bring up a consequence that the others are uncomfortable acknowledging`,

    landing: `PHASE: LANDING & FINAL WORDS
Generate closing arguments that reflect evolution from the debate.
- Each perspective should have SHIFTED slightly from their opening position — not reversed, but nuanced
- Include one moment of unexpected concession: a perspective admits the other side has a point on ONE specific thing
- The moderator observation should synthesize what was actually debated — not a generic summary
- End with genuine unresolved tension on a specific sub-question
- At least one perspective should end with a forward-looking question that lingers`,
  };

  // With only 2 characters, BOTH should debate — no pure moderator
  const isTwoPersonDebate = perspectives.length <= 2;

  const perspectiveBlock = perspectives
    .map((p, i) => `${p.name} (${p.angle}): Argue from a ${p.angle} viewpoint`)
    .join("\n");

  const moderatorNote = isTwoPersonDebate
    ? `\nIMPORTANT: There are only ${perspectives.length} participants. BOTH must argue their own position. The first character (${perspectives[0]?.name}) also guides the conversation — asking questions, framing topics — but they MUST ALSO argue their own viewpoint, not just moderate. There is NO separate moderator.`
    : `\nMODERATOR: Guides discussion, asks probing follow-up questions, challenges all sides`;

  const topicTransitionNote = topicIndex > 0 && previousTopicSummary
    ? `\nIMPORTANT — TOPIC TRANSITION:\nThis is topic #${topicIndex + 1} in the SAME episode. The panelists have been talking already.
Do NOT re-introduce the show or say "Welcome" or "Our topic tonight." Instead, transition organically.
The host should naturally segue: "Alright, let's shift gears..." or "Now, the other thing I wanted to get into..." or "Before we wrap, there's another powder keg..."
Reference lingering energy or emotions from the previous topic. Characters should carry their mood forward.
${previousTopicSummary}\n`
    : "";

  const previousContext = conversationSoFar
    ? `\nPREVIOUS CONVERSATION CONTENT (reference and build on this — do NOT repeat the same points):\n${conversationSoFar}\n`
    : "";

  const sourceBlock = sourceUrls.length > 0
    ? `\nSOURCE REFERENCES:\n${sourceUrls.map((u) => `- ${u}`).join("\n")}\n`
    : "";

  const scrapedBlock = scrapedContent
    ? `\nSCRAPED ARTICLE CONTENT (use this as research material — cite specific facts, names, and details from these articles):\n${scrapedContent}\n`
    : "";

  const system = `You are a senior investigative journalist and researcher preparing substantive debate content for an expert panel.

Your job is to generate the RAW ARGUMENTS, FACTS, AND EVIDENCE for a debate — NOT the final dialogue. Another system will convert this into character voices later.

${perspectiveBlock}${moderatorNote}

TOPIC: ${topicTitle}
${topicContent ? `PRIMARY TALKING POINTS (these are the USER'S key angles — you MUST address each one specifically):\n${topicContent}` : ""}
${sourceBlock}${scrapedBlock}

${phaseInstructions[beat.phase] || phaseInstructions.opening}
${topicTransitionNote}${previousContext}

SUBSTANCE REQUIREMENTS:
- Every claim MUST include at least one SPECIFIC: a person's name, a date, a statistic, a policy name, a dollar amount, a treaty, a historical event with year
- Do NOT use vague references like "the data shows" or "experts say" — name the data, name the expert
- When making a comparison, use specific numbers: "60% enrichment vs. the 90% needed for weaponization" not "close to weapons-grade"
- Include at least one fact that is genuinely surprising or lesser-known
- Arguments should BUILD on each other — address what was said before, don't just introduce new unrelated points

TARGET: ~${targetWords} words total across all perspectives.

OUTPUT FORMAT: Write as labeled paragraphs using CHARACTER NAMES:
${perspectives.map(p => `${p.name}: [their argument with evidence]`).join("\n")}
${isTwoPersonDebate ? "" : "MODERATOR: [their framing/question]\n"}${perspectives[0]?.name}: [response]
etc.

Write substantive prose — not bullet points. Each perspective entry should be 2-5 sentences.`;

  return {
    system,
    user: `Generate ${beat.name} content for the topic: "${topicTitle}"`,
  };
}

function buildDirectorPrompt(
  rawContent: string,
  characters: { id: string; name: string; role: string; prompt: string }[],
  beat: { name: string; phase: string },
  targetWords: number,
  conversationSoFar: string
): { system: string; user: string } {

  const characterList = characters
    .map((c) => `- ${c.name} (${c.role}): ID=${c.id}`)
    .join("\n");

  const phaseFlow: Record<string, string> = {
    opening: `FLOW PATTERN FOR OPENING:
- Host opens by framing the topic as a question to the room — addressing one guest by name first
- The addressed guest gives their take (2-3 sentences of substance)
- The OTHER guest jumps in unprompted: "Can I jump in here?" or "See, here's the thing..."
- Host reacts briefly, then asks a follow-up to either guest
- Allow 1-2 exchanges where two speakers go back and forth before the third joins
- End with a setup statement that will provoke the challenge round`,

    challenge: `FLOW PATTERN FOR CHALLENGE:
- One guest directly quotes or paraphrases what another guest said and challenges it
- The challenged guest defends (2-3 sentences) — the host should NOT intervene immediately
- After the defense, the host asks a pointed follow-up: "But what about [specific thing]?"
- Include a moment where TWO speakers agree on a specific FACT before disagreeing on its meaning
- Allow one speaker to hold the floor for an extended point (4+ sentences) while others add short interjections: "Right" / "But—" / "Hold on"
- The guest who's been quiet should self-select: "You know, I haven't said much about this, but..."`,

    evidence: `FLOW PATTERN FOR DEEP DIVE:
- The host asks a SPECIFIC question that forces detailed evidence: "Give me the actual numbers on that"
- One guest provides a detailed, multi-sentence explanation with specifics — this is a MONOLOGUE moment (4-6 sentences)
- During the monologue, include 1-2 SHORT interjections from others: "Exactly" or "That's the problem though"
- After the monologue, the other guest responds with their own counter-evidence — also detailed
- Include a SEGUE moment where the conversation naturally drifts to a related sub-topic through a specific connection
- Two guests may agree on a factual point and have a brief 2-3 turn agreement run before the third disrupts it
- Host bridges between sub-topics: "OK but that brings up another question..."`,

    escalation: `FLOW PATTERN FOR ESCALATION:
- The conversation is flowing normally, then ONE guest says something that triggers another's emotional core
- The triggered guest's response is IMMEDIATE and intense — they interrupt or talk over
- Allow a rapid-fire 2-turn exchange between the two heated speakers while the third watches
- The observer then cuts in: "WHOA, hold on" or "Both of you, stop for a second"
- Include one moment of SILENCE — marked as a pause or beat — after something hits hard
- The guest who was triggered may try to regain composure but fail: "Look, I'm sorry but—no, actually I'm NOT sorry"
- Host should be affected too — not just moderating, feeling the tension`,

    landing: `FLOW PATTERN FOR LANDING:
- Host pulls back from the heat: "Alright, let's bring it down a notch"
- Each guest gets a closing thought — but NOT round-robin. The host asks each one specifically
- One guest should CONCEDE something small but genuine before stating their final position
- Another guest should respond to the concession with surprise: "Wait, did you just agree with me on that?"
- The host closes with their own take — something personal, not just a summary
- End with an unresolved question — the host names it explicitly: "The question nobody answered tonight is..."`,
  };

  const previousContext = conversationSoFar
    ? `\nCONVERSATION SO FAR (design the flow to continue naturally from here):\n${conversationSoFar.slice(-2000)}\n`
    : "";

  const system = `You are a podcast conversation director. Your job is to take RAW DEBATE CONTENT and design how the conversation FLOWS between specific characters.

You are applying the Sacks-Schegloff-Jefferson turn-taking model and conversation analysis principles to create natural, dynamic dialogue structure.

CHARACTERS:
${characterList}

Map the content to these characters:
${characters.length <= 2
  ? `- ${characters[0]?.name} guides discussion AND argues their own position (they are NOT a pure moderator)
- Each character argues their own perspective based on ideological alignment
- Both characters should have roughly equal speaking time`
  : `- MODERATOR → the HOST character
- PERSPECTIVE_A, B, C → the GUEST characters (assign based on ideological alignment)`}

TURN-TAKING RULES:
1. CURRENT SPEAKER SELECTS NEXT: The host can direct a question to a specific guest by name
2. SELF-SELECTION: A guest can jump in without being asked: "Can I say something?", "Hold on", "You know what though—"
3. CONTINUATION: If nobody responds to a point, the current speaker can continue with additional detail
4. NOT ROUND-ROBIN: Two speakers can exchange 3-4 lines before the third joins. One speaker can hold the floor for a long point while others add interjections.

ADJACENCY PAIR RULES:
- After a QUESTION → the addressed person MUST answer (can't be skipped)
- After a CLAIM → someone CHALLENGES or AGREES (not both immediately — pick one, let the other react later)
- After a STORY/ANECDOTE → others REACT emotionally before making their own point
- After a STRONG STATEMENT → allow a BEAT (pause) before response

PREFERENCE ORGANIZATION:
- AGREEMENT should be quick and build energy: "Yeah exactly, and actually—" continuing the thought
- DISAGREEMENT should be delayed and mitigated: "Well... I mean, I see what you're saying, but the issue is really..."
- PARTIAL AGREEMENT before pivot: "You're right that X happened, but you're drawing the wrong conclusion because Y"
- NOT EVERY LINE IS DISAGREEMENT — sometimes two speakers agree for 2-3 turns before the third disrupts

${phaseFlow[beat.phase] || phaseFlow.opening}
${previousContext}

TARGET: ~${targetWords} words across ~${Math.max(6, Math.round(targetWords / 30))} turns/lines.

OUTPUT FORMAT — Write a structured conversation plan:

TURN 1 | [CharacterName] | [SELECTED_BY: host question / SELF_SELECT / CONTINUES] | [their content from the raw material — 2-5 sentences of substance, facts, and arguments] | [Flow note: "sets up challenge" / "builds on previous" / "segue to sub-topic"]
TURN 2 | [CharacterName] | [INTERJECTION during turn 1] | [1-3 words: "Right" / "Exactly" / "But—"] | [backchannel]
TURN 3 | [CharacterName] | [RESPONDS to turn 1] | [their response content] | [Flow note]
etc.

Include INTERJECTION lines — these are short backchannel responses ("mm-hmm", "right", "but wait—") that happen DURING someone else's extended turn. Mark these as INTERJECTION type.`;

  return {
    system,
    user: `Design the conversation flow for beat "${beat.name}" using this raw content:\n\n${rawContent}`,
  };
}

function buildVoicePrompt(
  structuredFlow: string,
  characters: { id: string; name: string; role: string; prompt: string }[],
  filterNote: string,
  beat: { name: string; phase: string }
): { system: string; user: string } {

  // Build condensed character voice profiles with intelligence tiers
  const voiceProfiles = characters.map((c) => {
    const lines = c.prompt.split("\n");
    const archLine = lines.find((l) => l.includes("PERSONALITY:"))
      ? lines.slice(lines.findIndex((l) => l.includes("PERSONALITY:")) + 1).find((l) => l.trim())?.trim()
      : "";

    // Determine archetype family from prompt content for intelligence filtering
    const isAggressive = /Firebrand|Provocateur|Bulldozer|Sniper/i.test(c.prompt);
    const isIntellectual = /Professor|Philosopher|Analyst|Skeptic/i.test(c.prompt);
    const isEntertainer = /Comedian|Storyteller|Wildcard|Hype Man/i.test(c.prompt);
    const isDiplomatic = /Mediator|Devil's Advocate|Empath|Elder/i.test(c.prompt);

    let intelligenceFilter = "";
    if (isAggressive) {
      intelligenceFilter = `INTELLIGENCE FILTER: ${c.name} is NOT an intellectual. When presented with complex arguments or data:
- They latch onto ONE fragment and ignore the nuance
- They oversimplify: "I don't care about your percentages — they want to kill us"
- They may MISREPRESENT what someone said, accidentally or deliberately
- They argue from gut feeling, emotion, and conviction — not analysis
- When confronted with evidence they can't counter, they change the subject or attack the messenger
- Their strength is emotional conviction, not factual accuracy`;
    } else if (isIntellectual) {
      intelligenceFilter = `INTELLIGENCE FILTER: ${c.name} processes complex information well:
- They synthesize multiple data points into coherent analysis
- They ask follow-up questions that reveal logical flaws
- They may be condescending about others' inability to grasp nuance
- They cite evidence while acknowledging limitations: "The data suggests X, but the sample was limited"
- Their weakness is over-intellectualizing emotional issues`;
    } else if (isEntertainer) {
      intelligenceFilter = `INTELLIGENCE FILTER: ${c.name} deflects complexity with humor or stories:
- They use analogies and stories instead of data to make points
- They occasionally drop a truth bomb that cuts through the noise
- They may appear to be joking but land devastating points
- They redirect tense moments with humor, sometimes inappropriately`;
    } else if (isDiplomatic) {
      intelligenceFilter = `INTELLIGENCE FILTER: ${c.name} contextualizes complexity through experience:
- They connect current issues to broader historical patterns
- They see multiple sides but have their own bias they're not fully aware of
- They mediate between others' positions but eventually reveal their own strong opinion
- They use "I've seen this before" to add depth, not to dismiss`;
    }

    // Extract generation for speech pattern matching
    const genLine = lines.find((l) => l.includes("GENERATIONAL CONTEXT:"));
    const isGenZ = /Gen Z|Generation Z|born 1997/i.test(c.prompt);
    const isBoomer = /Boomer|born 1946/i.test(c.prompt);
    const isGenX = /Gen X|Generation X|born 1965/i.test(c.prompt);
    const isMillennial = /Millennial|born 1981/i.test(c.prompt);

    let speechPatterns = "";
    if (isGenZ) {
      speechPatterns = `SPEECH PATTERNS:
- Filler words: "like", "I mean", "lowkey", "no cap", "um", "uh"
- Heavy disfluency: false starts, self-corrections, trailing sentences with "..."
- Hedging before disagreement: "I mean... look, I don't know about that"
- Surprise agreement: "Okay wait, I actually... huh. Yeah, that's a good point"
- Verbal processing: thinks out loud, backtracks: "Wait no, that's not what I—yeah, actually it IS what I mean"`;
    } else if (isBoomer || isGenX) {
      speechPatterns = `SPEECH PATTERNS:
- Measured, deliberate speech with purposeful pauses
- Filler words: "Look...", "Here's the thing...", "I'll tell you what..."
- Disagreement is calm but firm: "Well... I don't know about that"
- References to experience are SPECIFIC, not generic: "In '03, when I was covering the buildup to Iraq..."
- Limit historical references to MAX 2 per beat — each must ADD new information`;
    } else if (isMillennial) {
      speechPatterns = `SPEECH PATTERNS:
- Emphatic, repetitive when passionate
- False starts when angry: "The thing is—no, let me back up—the REAL thing is..."
- Starts sentences, abandons them, restarts louder
- Grudging agreement: "Fine, okay, THAT part is true, but—"
- References to personal experience as ultimate authority`;
    } else {
      speechPatterns = `SPEECH PATTERNS:
- Natural, conversational tone with occasional "um" and "uh"
- Disagreement with hedging: "I see your point, but..."
- Agreement that builds: "And to add to that..."`;
    }

    return `CHARACTER: ${c.name} (ID: ${c.id}, Role: ${c.role})
${intelligenceFilter}
${speechPatterns}`;
  }).join("\n\n---\n\n");

  const system = `You are an expert dialogue writer and voice actor. Your job is to take a STRUCTURED CONVERSATION PLAN and translate each line into natural, authentic character voice.

CRITICAL: You are NOT generating new content. The substance, arguments, and facts are ALREADY in the structured plan. Your job is to make each line SOUND like the character speaking it — their vocabulary, cadence, intelligence level, emotional reactions, and verbal tics.

${voiceProfiles}

CONTENT FILTER: ${filterNote}

VOICE TRANSLATION RULES:
1. KEEP ALL FACTS AND EVIDENCE from the structured plan — do not remove or water down specific claims, numbers, dates, or names
2. TRANSFORM the delivery through the character's voice and intelligence level:
   - An aggressive character given a nuanced argument should SIMPLIFY it and deliver it with conviction
   - An intellectual character should ADD qualifiers and cite sources
   - A diplomatic character should CONTEXTUALIZE with experience
3. ADD natural disfluency markers — these are NOT random, they serve specific functions:
   - "Um" before complex thoughts (planning marker)
   - "Well..." before disagreement (dispreference marker)
   - "Look..." before commanding attention
   - "I mean..." before self-correction
   - "You know what" before an insight
   - Trailing "..." when losing train of thought or when emotional
4. INTERJECTION lines should be very short (1-5 words): "Right", "Exactly", "But wait—", "Mm-hmm", "Hold on"
5. LONG TURNS (monologues) should show the speaker building their argument over 3-6 sentences within a single "text" field — not broken into separate lines
6. When a character AGREES, make it sound GENUINE and SPECIFIC: "You know what, Kevin's right about the enrichment timeline specifically..."
7. When a character DISAGREES, make the DELAY audible: "Well... okay. I hear you. But here's where that falls apart—"
8. Each character's SIGNATURE PHRASES should appear at MOST once per beat — NOT every line
9. Characters should OCCASIONALLY reference what they heard another character say by PARAPHRASING it, not just pivoting to their own point

CRITICAL ANTI-REPETITION RULES:
- If a character already said "I know what I know" in a previous beat, they CANNOT say it again
- If a character already referenced a specific historical event, they should reference a DIFFERENT one
- No character should make the same argument in different words
- Vary sentence length: mix punchy 5-word reactions with detailed 40-word explanations

TTS FORMATTING RULES (CRITICAL — violations cause audio failures):
- Do NOT use em dashes (—) or en dashes (–). Use commas, periods, or ellipses instead.
- Do NOT use asterisks for emphasis (*text*). Just write the text normally.
- Do NOT use smart/curly quotes. Use straight quotes only: ' and "
- Do NOT write stage directions in parentheses like (nods), (pauses), (audible scoff), (muttering)
- The ONLY parenthetical effects allowed are these exact Dia TTS effects:
  (laughs) (sighs) (clears throat) (singing) (screams) (chuckle) (inhales) (exhales)
  (gasps) (coughs) (sneezes) (sniffs) (groans) (burps) (sings) (humming)
  (whistles) (mumbles) (beep) (claps) (applause)
- Place effects WITHIN the text naturally: "Oh come on, (laughs) you can't be serious"
- Use ellipses (...) for pauses instead of dashes
- Keep interjections as plain text: "Exactly!" not "(exclaims) Exactly!"

OUTPUT: JSON array ONLY — every element must have ALL of these fields:
[
  { "speaker": "CharacterName", "characterId": "charId", "text": "...", "emotion": "angry" }
]

VALID SPEAKER NAMES: ${characters.map((c) => `"${c.name}"`).join(", ")}
VALID CHARACTER IDS: ${characters.map((c) => `"${c.id}"`).join(", ")}

Emotions: "neutral", "excited", "amused", "serious", "angry", "sarcastic", "concerned", "passionate", "dismissive", "shocked", "hesitant", "resigned", "defiant"`;

  return {
    system,
    user: `Translate this structured conversation plan into voiced dialogue for beat "${beat.name}":\n\n${structuredFlow}`,
  };
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

ALL lines MUST have "speaker": "${host.name}" and "characterId": "${host.id}" — never "Unknown".

OUTPUT: JSON array of dialogue lines. 3-5 lines, brief, natural, IN CHARACTER.
Emotions: "neutral", "excited", "amused", "serious", "sarcastic"`;

  try {
    const lines = await callLLMForDialogue(systemPrompt, `Write the outro for "${showName}".`);
    // Check that lines have actual text content, not just empty speaker fields
    const validLines = lines.filter((l) => l.text && l.text.trim().length > 0);
    if (validLines.length > 0) return validLines;
    console.warn("[PODCAST] Outro returned empty/invalid text — using fallback");
  } catch (err: any) {
    console.error(`[PODCAST] Outro generation failed: ${err.message} — using fallback`);
  }

  // Fallback outro if LLM returns empty or fails
  return [
    { speaker: host.name, characterId: host.id, text: `That's all the time we have for today, folks. ${guests.map((g) => g.name).join(" and ")}, appreciate you being here.`, emotion: "serious", duration: 6 },
    { speaker: host.name, characterId: host.id, text: `We'll be back next time with more to unpack. Until then — stay sharp.`, emotion: "neutral", duration: 4 },
    { speaker: host.name, characterId: host.id, text: `This has been ${showName}. I'm ${host.name}. Take care.`, emotion: "neutral", duration: 3 },
  ];
}

// ─── LLM Calls ──────────────────────────────────────────

// Raw text response — used for Pass 1 (Content) and Pass 2 (Director)
async function callDeepSeekRaw(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  const apiBase = (process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com").trim();
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not configured");

  const url = `${apiBase}/v1/chat/completions`;
  console.log(`[PODCAST] DeepSeek request to: ${url} (key: ${apiKey.slice(0, 6)}...${apiKey.slice(-4)})`);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(120000), // 2 min timeout
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.9,
        max_tokens: 8192,
      }),
    });
  } catch (fetchErr: any) {
    // Log the full error chain for debugging
    console.error(`[PODCAST] DeepSeek fetch error:`, {
      message: fetchErr.message,
      cause: fetchErr.cause?.message || fetchErr.cause || "no cause",
      code: fetchErr.cause?.code || fetchErr.code || "no code",
      errno: fetchErr.cause?.errno || "none",
      url,
    });
    throw new Error(`DeepSeek fetch failed: ${fetchErr.message} | cause: ${fetchErr.cause?.message || fetchErr.cause?.code || "unknown"}`);
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek raw error: ${res.status} — ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty DeepSeek raw response");

  return content;
}

// JSON dialogue response — used for Pass 3 (Voice) and standalone segments
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
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  const apiBase = (process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com").trim();
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not configured");

  const url = `${apiBase}/v1/chat/completions`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(120000),
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.9,
        max_tokens: 8192,
        response_format: { type: "json_object" },
      }),
    });
  } catch (fetchErr: any) {
    console.error(`[PODCAST] DeepSeek JSON fetch error:`, {
      message: fetchErr.message,
      cause: fetchErr.cause?.message || fetchErr.cause || "no cause",
      code: fetchErr.cause?.code || fetchErr.code || "no code",
      errno: fetchErr.cause?.errno || "none",
      url,
    });
    throw new Error(`DeepSeek fetch failed: ${fetchErr.message} | cause: ${fetchErr.cause?.message || fetchErr.cause?.code || "unknown"}`);
  }

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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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
