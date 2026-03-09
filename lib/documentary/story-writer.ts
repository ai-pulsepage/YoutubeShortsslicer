/**
 * Story Writer
 * 
 * Takes scraped articles and generates a full narrated documentary script.
 * Writing style, persona, audience, and pacing are all driven by the
 * genre preset system — no hardcoded style.
 * 
 * Adapted from TikTokShop's KnowledgeGenerator pattern.
 */

import { prisma } from "@/lib/prisma";
import type { ScrapedArticle } from "./scraper";
import { buildPromptContext, getWordsPerMinute } from "./genre-presets";

export interface StoryScript {
    title: string;
    estimatedDurationMinutes: number;
    segments: ScriptSegment[];
}

export interface ScriptSegment {
    timestamp: string; // e.g. "0:00", "2:30"
    narration: string;
    visualCue: string; // what should be shown
}

/** Configuration passed from genre selections */
export interface GenreConfig {
    genre: string;
    subStyle: string;
    audience: string;
    perspective: string;
    pacing: string;
    ending: string;
    endingNote?: string | null;
    contentMode: string;
}

function buildStoryWriterPrompt(config: GenreConfig, targetDuration: number): string {
    const styleContext = buildPromptContext({
        genre: config.genre,
        subStyle: config.subStyle,
        audience: config.audience,
        perspective: config.perspective,
        pacing: config.pacing,
        ending: config.ending,
        endingNote: config.endingNote || undefined,
        contentMode: config.contentMode,
    });

    const wpm = getWordsPerMinute(config.pacing);

    return `You are a world-class documentary scriptwriter creating a narrated production.

${styleContext}

ARTICLES TO BASE THE STORY ON:
{articles}

REQUIREMENTS:
1. Write a {duration}-minute narrated script (~${wpm} words per minute)
2. Each segment has a timestamp, narration text, and a [VISUAL] cue
3. Visual cues should describe what the viewer sees — be specific about environments and subjects
4. Use a narrative arc: hook → context → discovery → implications → resolution
5. Include vivid sensory language that helps the listener visualize
6. Create segments every 15-30 seconds of narration

OUTPUT FORMAT (JSON):
{
  "title": "Compelling title",
  "estimatedDurationMinutes": {duration},
  "segments": [
    {
      "timestamp": "0:00",
      "narration": "The actual words the narrator speaks...",
      "visualCue": "Wide aerial shot of a dark galaxy cluster..."
    },
    ...
  ]
}

Return ONLY valid JSON.`;
}

/**
 * Generates a full documentary script from scraped articles
 */
export async function generateStoryScript(
    articles: ScrapedArticle[],
    targetDurationMinutes: number = 30,
    config?: GenreConfig
): Promise<StoryScript> {
    const apiKey = await getApiKey();

    // Default config if none provided (backwards compatible)
    const effectiveConfig: GenreConfig = config || {
        genre: "science",
        subStyle: "bbc_earth",
        audience: "adults",
        perspective: "omniscient",
        pacing: "standard",
        ending: "ai_decide",
        contentMode: "creative",
    };

    // Format articles for the prompt
    const articlesText = articles
        .map((a, i) => {
            return `
--- Article ${i + 1}: "${a.title}" ---
Summary: ${a.summary}
Key Facts: ${a.keyFacts.join("; ")}
Scientific Concepts: ${a.scientificConcepts.join(", ")}
Quotes: ${a.quotes.join("; ")}
Emotional Hooks: ${a.emotionalHooks.join("; ")}
Novelty Score: ${a.noveltyScore}/10
`;
        })
        .join("\n");

    const promptTemplate = buildStoryWriterPrompt(effectiveConfig, targetDurationMinutes);
    const prompt = promptTemplate
        .replace("{articles}", articlesText)
        .replace(/\{duration\}/g, String(targetDurationMinutes));

    // Build system prompt from genre
    const styleLabel = `${effectiveConfig.genre}/${effectiveConfig.subStyle}`.replace(/_/g, " ");
    const systemPrompt = `You are a master scriptwriter specializing in ${styleLabel} content. Write engaging narration with rich sensory detail. Return only valid JSON.`;

    console.log(`[StoryWriter] Generating ${targetDurationMinutes}-min ${styleLabel} script from ${articles.length} articles...`);

    // Retry wrapper for DeepSeek API (handles ECONNRESET, timeouts)
    const MAX_RETRIES = 3;
    let response: Response | undefined;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            response = await fetch("https://api.deepseek.com/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: prompt },
                    ],
                    temperature: 0.8,
                    max_tokens: 8192,
                    response_format: { type: "json_object" },
                }),
            });
            break; // Success
        } catch (err: any) {
            console.error(`[StoryWriter] Fetch attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
            if (attempt === MAX_RETRIES) throw err;
            const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
            console.log(`[StoryWriter] Retrying in ${delay / 1000}s...`);
            await new Promise(r => setTimeout(r, delay));
        }
    }

    if (!response) throw new Error("Failed to get response from DeepSeek after retries");

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`DeepSeek API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
        throw new Error("Empty response from DeepSeek story writer");
    }

    const parsed = JSON.parse(content);

    const script: StoryScript = {
        title: parsed.title || "Untitled Documentary",
        estimatedDurationMinutes: parsed.estimatedDurationMinutes || targetDurationMinutes,
        segments: (parsed.segments || []).map((seg: Record<string, string>) => ({
            timestamp: seg.timestamp || "0:00",
            narration: seg.narration || "",
            visualCue: seg.visualCue || seg.visual_cue || seg.visual || "",
        })),
    };

    console.log(
        `[StoryWriter] ✅ Script generated: "${script.title}" — ${script.segments.length} segments`
    );

    return script;
}

/**
 * Saves a generated script to the documentary record
 */
export async function saveScriptToDocumentary(
    documentaryId: string,
    script: StoryScript
): Promise<void> {
    const fullText = script.segments
        .map((seg) => `[${seg.timestamp}] ${seg.narration}\n[VISUAL: ${seg.visualCue}]`)
        .join("\n\n");

    await prisma.documentary.update({
        where: { id: documentaryId },
        data: {
            title: script.title,
            script: fullText,
            totalDuration: script.estimatedDurationMinutes * 60,
        },
    });
}

async function getApiKey(): Promise<string> {
    const record = await prisma.apiKey.findUnique({
        where: { service: "deepseek" },
    }).catch(() => null);

    if (record?.key) return record.key;

    const envKey = process.env.DEEPSEEK_API_KEY;
    if (envKey) return envKey;

    throw new Error("DeepSeek API key not found. Set DEEPSEEK_API_KEY env var or add in Settings.");
}
