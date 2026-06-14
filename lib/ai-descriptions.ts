/**
 * AI Description Generator
 * Generates platform-specific titles, descriptions, and hashtags
 * for YouTube Shorts, Instagram Reels, and generic platforms.
 *
 * Modular: add new platforms by extending the PLATFORM_PROMPTS map.
 */

export type Platform = "YOUTUBE" | "INSTAGRAM" | "TIKTOK" | "GENERIC";

export interface GeneratedDescription {
    title: string;
    description: string;
    hashtags: string[];
    platform: Platform;
}

interface GenerateOptions {
    segmentTitle: string;
    segmentDescription?: string;
    transcriptExcerpt?: string;
    sourceVideoTitle?: string;
    platform: Platform;
    personality?: string;
}

function buildPersonalityPromptInstructions(personality?: string): string {
    if (!personality) return "";
    let rules = "";
    if (personality === "rage_bait") {
        rules += "\nPERSONALITY RULE: Act as a 'Rage Baiter'. Write provocative, mildly controversial, or highly opinionated hooks that spark debates in the comments. Make nonsensical claims or emphasize controversial angles in a way that viewers feel compelled to correct or comment on.";
    } else if (personality === "brainrot") {
        rules += "\nPERSONALITY RULE: Use 'Gen Z / Brainrot' style. Inject popular internet slang, high energy, abbreviations, all-lowercase text, or meme terminology (e.g. sigma, rizz, gyatt, skibidi, mewing, blud, cooks, let him cook, no cap, FR FR, etc.). Make it sound like it's from a Gen-Z meme page.";
    } else if (personality === "hype") {
        rules += "\nPERSONALITY RULE: Write in a highly enthusiastic, hype-filled, energetic style. Use multiple exclamation marks, uppercase words for emphasis, and lots of fire/rocket/gem emojis. Create high suspense or extreme excitement.";
    } else if (personality === "straight_forward") {
        rules += "\nPERSONALITY RULE: Write in a straightforward, informative, logical, and objective tone. Do not use overhyped phrases, clickbait, or exaggerated statements. Keep it intellectual, educational, and clean.";
    }
    return rules;
}

// Platform-specific prompt templates — easy to extend for new platforms
const PLATFORM_PROMPTS: Record<Platform, (opts: GenerateOptions) => string> = {
    YOUTUBE: (opts) => `Generate a YouTube Shorts title and description for a short video clip.

Clip title: ${opts.segmentTitle}
Clip description: ${opts.segmentDescription || "N/A"}
Source video: ${opts.sourceVideoTitle || "N/A"}
Transcript excerpt: ${opts.transcriptExcerpt || "N/A"}

Requirements:
- Title: catchy, under 100 chars, include relevant emoji, NO clickbait
- Description: 2-3 sentences, SEO-friendly, include "#Shorts" tag
- Hashtags: 5-8 relevant hashtags for discoverability${buildPersonalityPromptInstructions(opts.personality)}

Respond ONLY in JSON:
{"title": "...", "description": "...", "hashtags": ["#Shorts", ...]}`,

    INSTAGRAM: (opts) => `Generate an Instagram Reel caption for a short video clip.

Clip title: ${opts.segmentTitle}
Clip description: ${opts.segmentDescription || "N/A"}
Source video: ${opts.sourceVideoTitle || "N/A"}

Requirements:
- Title: compelling, under 50 chars
- Description: engaging caption with emojis, 1-2 sentences, NO links
- Hashtags: 10-15 relevant hashtags for Explore page discovery${buildPersonalityPromptInstructions(opts.personality)}

Respond ONLY in JSON:
{"title": "...", "description": "...", "hashtags": ["#Reels", ...]}`,

    TIKTOK: (opts) => `Generate a TikTok video caption for a short clip.

Clip title: ${opts.segmentTitle}
Clip description: ${opts.segmentDescription || "N/A"}

Requirements:
- Title: hook-style, under 80 chars
- Description: short, trendy, include emojis
- Hashtags: 5-10 trending + niche hashtags${buildPersonalityPromptInstructions(opts.personality)}

Respond ONLY in JSON:
{"title": "...", "description": "...", "hashtags": ["#fyp", ...]}`,

    GENERIC: (opts) => `Generate a social media post for a short video clip.

Clip title: ${opts.segmentTitle}
Clip description: ${opts.segmentDescription || "N/A"}

Requirements:
- Title: descriptive, under 100 chars
- Description: 1-2 sentences
- Hashtags: 5 relevant hashtags${buildPersonalityPromptInstructions(opts.personality)}

Respond ONLY in JSON:
{"title": "...", "description": "...", "hashtags": [...]}`,
};

/**
 * Generate platform-specific description using Together.ai or DeepSeek
 */
export async function generateDescription(
    opts: GenerateOptions,
    apiKey?: string
): Promise<GeneratedDescription> {
    const prompt = PLATFORM_PROMPTS[opts.platform]?.(opts) || PLATFORM_PROMPTS.GENERIC(opts);

    // Try Together.ai first (uses same key as Whisper/TTS)
    const key = apiKey || process.env.TOGETHER_API_KEY;
    if (!key) {
        // Fallback: generate locally without AI
        return {
            title: opts.segmentTitle,
            description: opts.segmentDescription || opts.segmentTitle,
            hashtags: opts.platform === "YOUTUBE"
                ? ["#Shorts", "#viral"]
                : opts.platform === "INSTAGRAM"
                    ? ["#Reels", "#explore"]
                    : ["#video"],
            platform: opts.platform,
        };
    }

    try {
        const res = await fetch("https://api.together.xyz/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "deepseek-ai/DeepSeek-V3",
                messages: [
                    { role: "system", content: "You are a social media expert. Only respond with valid JSON." },
                    { role: "user", content: prompt },
                ],
                max_tokens: 500,
                temperature: 0.7,
            }),
        });

        if (!res.ok) throw new Error(`API error: ${res.status}`);

        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || "";

        // Parse JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                title: parsed.title || opts.segmentTitle,
                description: parsed.description || "",
                hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
                platform: opts.platform,
            };
        }
    } catch (err) {
        console.warn("[AI Descriptions] Fallback:", (err as any).message);
    }

    // Fallback
    return {
        title: opts.segmentTitle,
        description: opts.segmentDescription || "",
        hashtags: opts.platform === "YOUTUBE" ? ["#Shorts"] : ["#Reels"],
        platform: opts.platform,
    };
}

/**
 * Batch generate descriptions for multiple shorts
 */
export async function batchGenerateDescriptions(
    items: GenerateOptions[],
    apiKey?: string
): Promise<GeneratedDescription[]> {
    const results: GeneratedDescription[] = [];
    for (const item of items) {
        const desc = await generateDescription(item, apiKey);
        results.push(desc);
        // Small delay to avoid rate limits
        await new Promise((r) => setTimeout(r, 200));
    }
    return results;
}
