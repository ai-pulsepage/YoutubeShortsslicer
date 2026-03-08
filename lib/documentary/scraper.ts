/**
 * Article Scraper
 * 
 * Pattern adapted from TikTokShop's UniversalProductReader.
 * Fetches article URLs, extracts text, uses DeepSeek to produce
 * structured article data for the story writer.
 */

import { prisma } from "@/lib/prisma";

// Lightweight HTML-to-text extraction
function extractArticleText(html: string): {
    title: string;
    metaDescription: string;
    bodyText: string;
} {
    // Extract <title>
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch?.[1]?.trim() || "";

    // Extract meta description
    const metaMatch = html.match(
        /<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i
    );
    const metaDescription = metaMatch?.[1]?.trim() || "";

    // Strip scripts, styles, nav, footer, header
    let cleaned = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[\s\S]*?<\/nav>/gi, "")
        .replace(/<footer[\s\S]*?<\/footer>/gi, "")
        .replace(/<header[\s\S]*?<\/header>/gi, "")
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

    // Strip remaining HTML tags
    cleaned = cleaned.replace(/<[^>]+>/g, " ");

    // Collapse whitespace
    cleaned = cleaned.replace(/\s+/g, " ").trim();

    // Limit to ~5000 chars to save LLM tokens
    const bodyText = cleaned.slice(0, 5000);

    return { title, metaDescription, bodyText };
}

export interface ScrapedArticle {
    url: string;
    title: string;
    keyFacts: string[];
    quotes: string[];
    scientificConcepts: string[];
    emotionalHooks: string[];
    noveltyScore: number;
    summary: string;
}

/**
 * Fetches a single URL and extracts article text.
 * Falls back gracefully if the site blocks server-side requests (403/503).
 */
async function fetchArticle(url: string): Promise<{
    url: string;
    title: string;
    metaDescription: string;
    bodyText: string;
}> {
    // Try direct fetch first with realistic browser headers
    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                Accept:
                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Cache-Control": "no-cache",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
                "Upgrade-Insecure-Requests": "1",
            },
            redirect: "follow",
        });

        if (response.ok) {
            const html = await response.text();
            const extracted = extractArticleText(html);
            if (extracted.bodyText.length > 200) {
                return { url, ...extracted };
            }
            // Body too short — page is probably JS-rendered, fall through
            console.log(`[Scraper] Page body too short (${extracted.bodyText.length} chars), trying fallback...`);
        } else {
            console.log(`[Scraper] Direct fetch returned ${response.status}, trying fallback...`);
        }
    } catch (err) {
        console.log(`[Scraper] Direct fetch failed: ${err}, trying fallback...`);
    }

    // For scientific publication sites, try known API/alternate endpoints
    const altContent = await tryScientificAlternatives(url);
    if (altContent) return altContent;

    // Final fallback: use the URL itself + any info we can extract from the URL path
    // DeepSeek likely has knowledge about published papers from its training data
    console.log(`[Scraper] All fetches failed for ${url}, using URL-based fallback`);
    const urlParts = new URL(url);
    const pathSegments = urlParts.pathname.split("/").filter(Boolean);
    const titleFromUrl = pathSegments[pathSegments.length - 1]?.replace(/[-_]/g, " ") || "";

    return {
        url,
        title: titleFromUrl,
        metaDescription: "",
        bodyText: `[This article could not be directly fetched due to access restrictions. The URL is: ${url}. The AI should use its knowledge about this publication to generate content. Domain: ${urlParts.hostname}, Path: ${urlParts.pathname}]`,
    };
}

/**
 * Try alternative fetching strategies for known scientific publication sites
 */
async function tryScientificAlternatives(url: string): Promise<{
    url: string;
    title: string;
    metaDescription: string;
    bodyText: string;
} | null> {
    const hostname = new URL(url).hostname;

    // preprints.org — try the PDF or abstract API
    if (hostname.includes("preprints.org")) {
        // Try fetching the abstract page or ver1 HTML
        const altUrls = [
            url + "/v1",
            url.replace("/manuscript/", "/manuscript/") + "?version=1",
        ];
        for (const altUrl of altUrls) {
            try {
                const res = await fetch(altUrl, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
                        Accept: "text/html",
                    },
                    redirect: "follow",
                });
                if (res.ok) {
                    const html = await res.text();
                    const extracted = extractArticleText(html);
                    if (extracted.bodyText.length > 200) {
                        return { url, ...extracted };
                    }
                }
            } catch { /* continue to next alt */ }
        }
    }

    // arxiv.org — use the abstract page directly
    if (hostname.includes("arxiv.org")) {
        const absUrl = url.replace("/pdf/", "/abs/");
        try {
            const res = await fetch(absUrl, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; research-bot)" },
            });
            if (res.ok) {
                const html = await res.text();
                const extracted = extractArticleText(html);
                if (extracted.bodyText.length > 100) {
                    return { url, ...extracted };
                }
            }
        } catch { /* fall through */ }
    }

    return null;
}

/**
 * Uses DeepSeek to extract structured article data from raw text
 */
async function extractWithLLM(
    article: { url: string; title: string; metaDescription: string; bodyText: string },
    apiKey: string
): Promise<ScrapedArticle> {
    const prompt = `You are a research assistant extracting structured data from a science article.

URL: ${article.url}
Title: ${article.title}
Meta: ${article.metaDescription}

Article Text (truncated):
${article.bodyText}

Extract the following in JSON format:
{
  "title": "Clear, compelling article title",
  "keyFacts": ["5-8 key factual claims from the article"],
  "quotes": ["Notable quotes from scientists or officials (if any)"],
  "scientificConcepts": ["Scientific concepts discussed (e.g. dark matter, quantum entanglement)"],
  "emotionalHooks": ["2-3 aspects that would emotionally engage a listener (wonder, surprise, fear)"],
  "noveltyScore": 1-10 (how novel/surprising is this discovery?),
  "summary": "2-3 sentence summary of the article's core finding"
}

Rules:
- Focus on facts, not opinions
- Key facts should be specific and verifiable
- Emotional hooks should be genuine, not clickbait
- If the article text mentions it could not be fetched, use YOUR OWN KNOWLEDGE about the publication from the URL to fill in the details as best you can. Look at the URL domain and path for clues about the paper topic.
- Return ONLY valid JSON`;

    const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
                { role: "system", content: "You are a science research data extractor. Return only valid JSON." },
                { role: "user", content: prompt },
            ],
            temperature: 0.1,
            max_tokens: 1500,
            response_format: { type: "json_object" },
        }),
    });

    if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
        throw new Error("Empty response from DeepSeek");
    }

    const parsed = JSON.parse(content);
    return {
        url: article.url,
        title: parsed.title || article.title,
        keyFacts: parsed.keyFacts || parsed.key_facts || [],
        quotes: parsed.quotes || [],
        scientificConcepts: parsed.scientificConcepts || parsed.scientific_concepts || [],
        emotionalHooks: parsed.emotionalHooks || parsed.emotional_hooks || [],
        noveltyScore: parsed.noveltyScore || parsed.novelty_score || 5,
        summary: parsed.summary || "",
    };
}

/**
 * Retrieves the DeepSeek API key from the database
 */
async function getApiKey(): Promise<string> {
    // Try database first, then env var fallback
    const record = await prisma.apiKey.findUnique({
        where: { service: "deepseek" },
    }).catch(() => null);

    if (record?.key) return record.key;

    const envKey = process.env.DEEPSEEK_API_KEY;
    if (envKey) return envKey;

    throw new Error("DeepSeek API key not found. Set DEEPSEEK_API_KEY env var or add in Settings.");
}

/**
 * Scrapes multiple article URLs and returns structured data
 */
export async function scrapeArticles(urls: string[]): Promise<ScrapedArticle[]> {
    const apiKey = await getApiKey();
    const results: ScrapedArticle[] = [];

    for (const url of urls) {
        try {
            console.log(`[Scraper] Fetching: ${url}`);
            const raw = await fetchArticle(url);

            console.log(`[Scraper] Extracting with LLM: ${raw.title}`);
            const structured = await extractWithLLM(raw, apiKey);

            results.push(structured);
            console.log(`[Scraper] ✅ Done: ${structured.title} (novelty: ${structured.noveltyScore})`);
        } catch (error) {
            console.error(`[Scraper] ❌ Failed for ${url}:`, error);
            // Continue with other URLs
        }
    }

    return results;
}
