/**
 * Clip Metadata Generator
 *
 * Uses AI to generate platform-optimized titles, descriptions, and hashtags
 * for each clip — tailored for TikTok, YouTube Shorts, and Instagram Reels.
 */

interface ClipMetadata {
    title: string;
    description: string;
    hashtags: string[];
}

interface GenerateMetadataOptions {
    clipTitle: string;        // AI-suggested clip title from segmentation
    clipDescription: string;  // AI-suggested description
    sourceVideoTitle: string; // Original video title
    campaignName?: string;    // Optional campaign name
    platform: "tiktok" | "youtube" | "instagram";
}

const METADATA_PROMPT = `You are a viral short-form content expert. Generate optimized metadata for a video clip being posted on social media.

RULES:
1. Title should be HOOK-FIRST — grab attention in the first 3 words
2. Description should be concise (max 150 chars for TikTok, 500 for YouTube)
3. Include 5-8 relevant hashtags that maximize discoverability
4. DO NOT use overly clickbait titles — keep them authentic but engaging
5. Match the platform's culture and style

Respond ONLY with valid JSON:
{
  "title": "Your engaging title here",
  "description": "Brief compelling description",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}`;

/**
 * Generate platform-optimized metadata for a clip
 */
export async function generateClipMetadata(
    options: GenerateMetadataOptions
): Promise<ClipMetadata> {
    const { clipTitle, clipDescription, sourceVideoTitle, campaignName, platform } = options;

    const platformGuidelines: Record<string, string> = {
        tiktok: "TikTok: casual tone, trending hashtags, max 150 char description, use emojis sparingly",
        youtube: "YouTube Shorts: SEO-optimized title (max 100 chars), searchable description, mix trending + niche hashtags",
        instagram: "Instagram Reels: aesthetic tone, community hashtags, engaging caption, max 2200 chars",
    };

    let apiKey = process.env.DEEPSEEK_API_KEY;
    const apiBase = process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com";

    if (!apiKey) {
        apiKey = await getDbApiKey("deepseek_api_key") || undefined;
    }

    if (!apiKey) {
        // Fallback: generate basic metadata without AI
        return generateFallbackMetadata(options);
    }

    try {
        const response = await fetch(`${apiBase}/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: METADATA_PROMPT },
                    {
                        role: "user",
                        content: `Platform: ${platformGuidelines[platform] || platform}
Original Video: "${sourceVideoTitle}"
Clip Title: "${clipTitle}"
Clip Description: "${clipDescription}"
${campaignName ? `Campaign: "${campaignName}"` : ""}

Generate the metadata.`,
                    },
                ],
                temperature: 0.7,
                max_tokens: 500,
                response_format: { type: "json_object" },
            }),
        });

        if (!response.ok) {
            console.warn("[ClipMeta] AI request failed, using fallback");
            return generateFallbackMetadata(options);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) return generateFallbackMetadata(options);

        const parsed = JSON.parse(content);
        return {
            title: parsed.title || clipTitle,
            description: parsed.description || clipDescription,
            hashtags: Array.isArray(parsed.hashtags)
                ? parsed.hashtags.map((h: string) => h.replace(/^#/, ""))
                : [],
        };
    } catch (error: any) {
        console.warn("[ClipMeta] Error generating metadata:", error.message);
        return generateFallbackMetadata(options);
    }
}

/**
 * Generate metadata without AI — basic but functional
 */
function generateFallbackMetadata(options: GenerateMetadataOptions): ClipMetadata {
    const { clipTitle, clipDescription, platform } = options;

    const platformHashtags: Record<string, string[]> = {
        tiktok: ["fyp", "viral", "foryou", "foryoupage", "trending"],
        youtube: ["shorts", "viral", "trending", "subscribe", "fyp"],
        instagram: ["reels", "viral", "explore", "trending", "fyp"],
    };

    return {
        title: clipTitle,
        description: clipDescription,
        hashtags: platformHashtags[platform] || platformHashtags.tiktok,
    };
}

/**
 * Generate metadata for all platforms at once
 */
export async function generateAllPlatformMetadata(
    clipTitle: string,
    clipDescription: string,
    sourceVideoTitle: string,
    campaignName?: string,
    platforms: string[] = ["tiktok", "youtube", "instagram"]
): Promise<Record<string, ClipMetadata>> {
    const results: Record<string, ClipMetadata> = {};

    for (const platform of platforms) {
        results[platform] = await generateClipMetadata({
            clipTitle,
            clipDescription,
            sourceVideoTitle,
            campaignName,
            platform: platform as "tiktok" | "youtube" | "instagram",
        });
    }

    return results;
}

// Read API key from DB
async function getDbApiKey(service: string): Promise<string | null> {
    try {
        const { prisma } = await import("@/lib/prisma");
        const dbKey = await prisma.apiKey.findUnique({ where: { service } });
        if (dbKey?.key) {
            return Buffer.from(dbKey.key, "base64").toString("utf8");
        }
    } catch { }
    return null;
}
