/**
 * Story Writer
 * 
 * Takes scraped articles and generates a full narrated documentary script.
 * Writes for a 10-year-old audience with analogies and visual cues.
 * 
 * Adapted from TikTokShop's KnowledgeGenerator pattern.
 */

import { prisma } from "@/lib/prisma";
import type { ScrapedArticle } from "./scraper";

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

const STORY_WRITER_PROMPT = `You are a world-class documentary scriptwriter. Your specialty is making complex science accessible and fascinating — like David Attenborough meets Bill Nye meets Neil deGrasse Tyson.

You are writing a narrated documentary designed for adults who want to learn while relaxing or falling asleep. The tone should be:
- Calm, warm, and engaging (not hyper or clickbaity)
- Explain as if the listener is 10 years old, using analogies and comparisons
- Build genuine wonder and curiosity
- Use illustrative language that helps the listener visualize

ARTICLES TO BASE THE STORY ON:
{articles}

REQUIREMENTS:
1. Write a {duration}-minute narrated script
2. Each segment has a timestamp, narration text, and a [VISUAL] cue
3. Visual cues should describe what the viewer sees — be specific about characters, environments, camera angles
4. Use a narrative arc: hook → context → discovery → implications → wonder
5. Include analogies (e.g., "Imagine if the Sun were the size of a basketball...")
6. Include brief "imagine you are there" moments for immersion
7. End with a reflective, thought-provoking conclusion

OUTPUT FORMAT (JSON):
{
  "title": "Compelling documentary title",
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

Aim for approximately 150 words per minute of narration.
Create segments every 15-30 seconds of narration.
Return ONLY valid JSON.`;

/**
 * Generates a full documentary script from scraped articles
 */
export async function generateStoryScript(
    articles: ScrapedArticle[],
    targetDurationMinutes: number = 30
): Promise<StoryScript> {
    const apiKey = await getApiKey();

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

    const prompt = STORY_WRITER_PROMPT
        .replace("{articles}", articlesText)
        .replace(/\{duration\}/g, String(targetDurationMinutes));

    console.log(`[StoryWriter] Generating ${targetDurationMinutes}-min script from ${articles.length} articles...`);

    const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
                {
                    role: "system",
                    content:
                        "You are a master documentary scriptwriter. Write engaging, calming narration with rich visual descriptions. Return only valid JSON.",
                },
                { role: "user", content: prompt },
            ],
            temperature: 0.8,
            max_tokens: 16000, // Long scripts need lots of tokens
            response_format: { type: "json_object" },
        }),
    });

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
