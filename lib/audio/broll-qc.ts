/**
 * B-Roll Quality Control
 *
 * Uses keyword extraction + Pexels search to find relevant B-Roll footage.
 * In Phase 2, CLIP scoring will be added for visual relevance scoring.
 *
 * For now, uses Pexels relevance ranking (their API already sorts by relevance)
 * and basic keyword matching.
 */

import fs from "fs";
import path from "path";

interface BRollResult {
    videoUrl: string;
    thumbnailUrl?: string;
    query: string;
    duration: number;
    relevanceScore: number; // 0-1, from search ranking
}

/**
 * Find B-Roll footage from Pexels matching the scene description.
 * Returns the best matching video clip, or null if nothing suitable found.
 */
export async function findBRoll(
    narrationText: string,
    sceneTitle: string,
    targetDuration: number = 5,
    minRelevance: number = 0.5,
): Promise<BRollResult | null> {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
        console.warn("[B-Roll QC] PEXELS_API_KEY not configured");
        return null;
    }

    // Extract search keywords from narration and title
    const keywords = extractVisualKeywords(`${sceneTitle} ${narrationText}`);
    if (keywords.length === 0) return null;

    const query = keywords.join(" ");
    console.log(`[B-Roll QC] Searching Pexels for: "${query}"`);

    try {
        const response = await fetch(
            `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=5&min_duration=${Math.max(1, targetDuration - 3)}&max_duration=${targetDuration + 10}`,
            {
                headers: { Authorization: apiKey },
            }
        );

        if (!response.ok) {
            console.warn(`[B-Roll QC] Pexels search failed: ${response.status}`);
            return null;
        }

        const data = await response.json();
        const videos = data.videos || [];

        if (videos.length === 0) {
            console.warn(`[B-Roll QC] No results for "${query}"`);
            return null;
        }

        // Pick best result — Pexels already sorts by relevance
        // Assign a relevance score based on position (1st = 1.0, 5th = 0.2)
        for (let i = 0; i < videos.length; i++) {
            const video = videos[i];
            const score = 1.0 - (i * 0.2);

            if (score < minRelevance) continue;

            // Get the best quality video file
            const videoFiles = video.video_files || [];
            const bestFile = videoFiles
                .filter((f: any) => f.width >= 720)
                .sort((a: any, b: any) => (b.width || 0) - (a.width || 0))[0]
                || videoFiles[0];

            if (!bestFile?.link) continue;

            return {
                videoUrl: bestFile.link,
                thumbnailUrl: video.image,
                query,
                duration: video.duration || 5,
                relevanceScore: score,
            };
        }

        return null;
    } catch (err: any) {
        console.warn(`[B-Roll QC] Error: ${err.message}`);
        return null;
    }
}

/**
 * Download B-Roll video to local file.
 */
export async function downloadBRoll(
    videoUrl: string,
    outputPath: string,
): Promise<boolean> {
    try {
        const response = await fetch(videoUrl);
        if (!response.ok) return false;

        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(outputPath, buffer);
        return true;
    } catch {
        return false;
    }
}

/**
 * Extract visually meaningful keywords for B-Roll search.
 * Focuses on nouns and visual descriptors.
 */
function extractVisualKeywords(text: string): string[] {
    const stopWords = new Set([
        "the", "a", "an", "is", "are", "was", "were", "be", "been",
        "being", "have", "has", "had", "do", "does", "did", "will",
        "would", "could", "should", "shall", "can", "may", "might",
        "to", "of", "in", "for", "on", "with", "at", "by", "from",
        "as", "into", "through", "during", "before", "after", "then",
        "once", "here", "there", "when", "where", "why", "how", "all",
        "each", "every", "both", "few", "more", "most", "other", "some",
        "such", "no", "not", "only", "very", "just", "about", "and",
        "but", "or", "if", "while", "that", "this", "scene", "chapter",
        "narrator", "says", "said", "tells", "told", "speaks", "spoke",
        "explains", "describes", "mentions", "notes", "adds", "continues",
        "however", "also", "its", "their", "our", "his", "her", "your",
        "my", "he", "she", "it", "we", "they", "them", "him", "us", "you",
    ]);

    return text
        .toLowerCase()
        .replace(/[^a-z\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !stopWords.has(w))
        .slice(0, 3);
}
