/**
 * Freesound API Integration
 *
 * Fetches ambient sound effects and SFX matching scene mood/keywords.
 * Uses FREESOUND_CLIENT_ID and FREESOUND_API_KEY from .env.
 */

import fs from "fs";
import path from "path";

interface FreesoundResult {
    id: number;
    name: string;
    duration: number;
    previews: {
        "preview-hq-mp3"?: string;
        "preview-lq-mp3"?: string;
    };
    avg_rating: number;
    tags: string[];
}

/**
 * Search Freesound for ambient SFX matching scene keywords.
 * Downloads the best match and returns the local file path.
 * Returns null if no match found or API unavailable.
 */
export async function fetchFreesoundSfx(
    query: string,
    outputDir: string,
    maxDuration: number = 30,
): Promise<string | null> {
    const clientId = process.env.FREESOUND_CLIENT_ID;
    const apiKey = process.env.FREESOUND_API_KEY;

    if (!apiKey || !clientId) {
        console.warn("[Freesound] API keys not configured, skipping SFX");
        return null;
    }

    try {
        // Extract keywords from scene title/text for better search
        const searchTerms = extractKeywords(query);
        const searchQuery = searchTerms.join(" ");

        console.log(`[Freesound] Searching for: "${searchQuery}"`);

        const url = new URL("https://freesound.org/apiv2/search/text/");
        url.searchParams.set("query", searchQuery);
        url.searchParams.set("token", apiKey);
        url.searchParams.set("fields", "id,name,duration,previews,avg_rating,tags");
        url.searchParams.set("filter", `duration:[1 TO ${maxDuration}]`);
        url.searchParams.set("sort", "rating_desc");
        url.searchParams.set("page_size", "5");

        const response = await fetch(url.toString());
        if (!response.ok) {
            console.warn(`[Freesound] Search failed: ${response.status}`);
            return null;
        }

        const data = await response.json();
        const results: FreesoundResult[] = data.results || [];

        if (results.length === 0) {
            console.warn(`[Freesound] No results for "${searchQuery}"`);
            return null;
        }

        // Pick the highest-rated result
        const best = results[0];
        const previewUrl = best.previews?.["preview-hq-mp3"] || best.previews?.["preview-lq-mp3"];

        if (!previewUrl) {
            console.warn(`[Freesound] No preview URL for ${best.name}`);
            return null;
        }

        // Download the preview
        const sfxPath = path.join(outputDir, `sfx-${best.id}.mp3`);
        const audioResponse = await fetch(previewUrl);

        if (!audioResponse.ok) {
            console.warn(`[Freesound] Download failed for ${best.name}`);
            return null;
        }

        const buffer = Buffer.from(await audioResponse.arrayBuffer());
        fs.writeFileSync(sfxPath, buffer);

        console.log(`[Freesound] Downloaded: "${best.name}" (${best.duration.toFixed(1)}s)`);
        return sfxPath;
    } catch (err: any) {
        console.warn(`[Freesound] Error: ${err.message}`);
        return null;
    }
}

/**
 * Extract relevant keywords from scene text for Freesound search.
 * Strips common words and focuses on environmental/mood terms.
 */
function extractKeywords(text: string): string[] {
    const stopWords = new Set([
        "the", "a", "an", "is", "are", "was", "were", "be", "been",
        "being", "have", "has", "had", "do", "does", "did", "will",
        "would", "could", "should", "may", "might", "shall", "can",
        "to", "of", "in", "for", "on", "with", "at", "by", "from",
        "as", "into", "through", "during", "before", "after", "above",
        "below", "between", "out", "off", "over", "under", "again",
        "further", "then", "once", "here", "there", "when", "where",
        "why", "how", "all", "each", "every", "both", "few", "more",
        "most", "other", "some", "such", "no", "not", "only", "own",
        "same", "so", "than", "too", "very", "just", "about", "and",
        "but", "or", "if", "while", "that", "this", "his", "her",
        "its", "our", "their", "your", "my", "he", "she", "it", "we",
        "they", "them", "him", "us", "you", "me", "scene", "chapter",
    ]);

    return text
        .toLowerCase()
        .replace(/[^a-z\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w))
        .slice(0, 4); // Max 4 keywords
}
