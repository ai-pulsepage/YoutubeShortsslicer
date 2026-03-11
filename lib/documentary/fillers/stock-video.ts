/**
 * Stock Video Filler Generator (Pexels API)
 *
 * Searches Pexels for free stock videos matching scene context,
 * downloads them, and trims/loops to fill the required duration.
 */

import { execSync } from "child_process";
import path from "path";
import fs from "fs";

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || "";

interface PexelsVideo {
    id: number;
    url: string;
    video_files: Array<{
        id: number;
        quality: string;
        file_type: string;
        width: number;
        height: number;
        link: string;
    }>;
}

interface PexelsResponse {
    videos: PexelsVideo[];
    total_results: number;
}

/**
 * Extract search keywords from narration text.
 * Extracts concrete, visual nouns that Pexels actually has results for.
 * Falls back to scene title words if narration yields nothing.
 */
function extractKeywords(narrationText: string, sceneTitle?: string): string {
    // Concrete visual nouns that Pexels has good footage for
    const VISUAL_NOUNS = new Set([
        // Nature
        "forest", "lake", "river", "ocean", "mountain", "trees", "sky", "clouds",
        "sunset", "sunrise", "rain", "snow", "storm", "stars", "moon", "sun",
        "field", "meadow", "desert", "beach", "waterfall", "cave", "cliff",
        "woods", "path", "trail", "flowers", "garden", "fog", "mist",
        // Buildings & Spaces
        "cabin", "house", "building", "city", "town", "village", "church",
        "school", "office", "hospital", "factory", "bridge", "road", "highway",
        "door", "window", "room", "hallway", "basement", "attic", "stairs",
        "library", "museum", "temple", "ruins", "castle",
        // People & Activities
        "children", "kids", "people", "crowd", "family", "woman", "man",
        "walking", "running", "swimming", "sleeping", "reading", "writing",
        "camping", "hiking", "campfire", "bonfire", "fire", "candle",
        // Objects
        "car", "train", "boat", "airplane", "bicycle",
        "book", "letter", "map", "compass", "flashlight", "torch",
        "clock", "phone", "computer", "photograph", "mirror",
        "paper", "notebook", "documents", "folder", "cabinet",
        // Emotions & Atmosphere
        "darkness", "shadow", "light", "night", "morning", "evening",
        "silence", "fear", "mystery",
        // Camp specific
        "camp", "tent", "bunk", "canoe", "dock", "archery", "flag",
        "bus", "counselor", "scouts", "summer",
    ]);

    // Clean narration — remove timestamps, VISUAL markers, special chars
    const cleanText = narrationText
        .replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/g, "")
        .replace(/\[VISUAL:[^\]]*\]/gi, "")
        .replace(/[^a-zA-Z\s]/g, " ")
        .toLowerCase();

    const words = cleanText.split(/\s+/).filter(w => w.length > 2);

    // Find concrete visual nouns from narration
    const found: string[] = [];
    const seen = new Set<string>();
    for (const word of words) {
        // Check singular and plural forms
        const singular = word.endsWith("s") ? word.slice(0, -1) : word;
        const check = VISUAL_NOUNS.has(word) ? word : (VISUAL_NOUNS.has(singular) ? singular : null);
        if (check && !seen.has(check)) {
            seen.add(check);
            found.push(check);
            if (found.length >= 3) break; // 2-3 keywords is optimal for Pexels
        }
    }

    if (found.length > 0) {
        return found.join(" ");
    }

    // Fallback: use scene title but clean it up for Pexels
    if (sceneTitle) {
        const titleWords = sceneTitle
            .replace(/[^a-zA-Z\s]/g, "")
            .split(/\s+/)
            .filter(w => w.length > 3 && !["the", "and", "but", "that", "this", "with", "from"].includes(w.toLowerCase()))
            .slice(0, 2)
            .map(w => w.toLowerCase());

        if (titleWords.length > 0) return titleWords.join(" ");
    }

    return "cinematic nature landscape";
}

/**
 * Search Pexels for stock videos matching keywords.
 */
async function searchPexelsVideos(query: string, count = 5): Promise<PexelsVideo[]> {
    if (!PEXELS_API_KEY) {
        console.warn("[StockVideo] No PEXELS_API_KEY set, cannot search");
        return [];
    }

    try {
        const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape&size=medium`;
        const response = await fetch(url, {
            headers: { Authorization: PEXELS_API_KEY },
        });

        if (!response.ok) {
            console.warn(`[StockVideo] Pexels API returned ${response.status}`);
            return [];
        }

        const data: PexelsResponse = await response.json();
        return data.videos || [];
    } catch (err: any) {
        console.warn(`[StockVideo] Pexels search failed: ${err.message}`);
        return [];
    }
}

/**
 * Download a video file from URL to local path.
 */
async function downloadVideo(url: string, outputPath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
}

/**
 * Generate stock video filler from Pexels.
 *
 * @param narrationText - Scene narration text for keyword extraction
 * @param outputPath - Where to write the output MP4
 * @param duration - Total filler duration needed in seconds
 * @param sceneTitle - Optional scene title for better search results
 * @param width - Video width
 * @param height - Video height
 */
export async function generateStockVideoFiller(
    narrationText: string,
    outputPath: string,
    duration: number,
    sceneTitle?: string,
    width = 1280,
    height = 720,
): Promise<boolean> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const keywords = extractKeywords(narrationText, sceneTitle);
    console.log(`[StockVideo] Searching Pexels for: "${keywords}"`);

    const videos = await searchPexelsVideos(keywords, 8);

    if (videos.length === 0) {
        console.warn(`[StockVideo] No results for "${keywords}", trying generic terms...`);
        const fallbackVideos = await searchPexelsVideos("abstract background cinematic", 5);
        if (fallbackVideos.length === 0) {
            console.warn("[StockVideo] No stock videos available");
            return false;
        }
        videos.push(...fallbackVideos);
    }

    // Download and trim stock videos
    const segments: string[] = [];
    let accumulatedDuration = 0;
    const targetSegmentDuration = 15; // seconds per stock clip

    for (let i = 0; i < videos.length && accumulatedDuration < duration; i++) {
        const video = videos[i];

        // Find HD or medium quality file (720p-ish)
        const videoFile = video.video_files
            .filter((f) => f.file_type === "video/mp4" && f.width >= 640)
            .sort((a, b) => {
                const aDist = Math.abs(a.width - width);
                const bDist = Math.abs(b.width - width);
                return aDist - bDist;
            })[0];

        if (!videoFile) continue;

        const rawPath = path.join(dir, `stock-raw-${i}.mp4`);
        const segPath = path.join(dir, `stock-seg-${i}.mp4`);
        const segDuration = Math.min(targetSegmentDuration, duration - accumulatedDuration);

        try {
            // Download
            await downloadVideo(videoFile.link, rawPath);

            // Trim and resize to match documentary resolution
            execSync(
                `ffmpeg -i "${rawPath}" -t ${segDuration} ` +
                `-vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black" ` +
                `-c:v libx264 -preset fast -pix_fmt yuv420p -an "${segPath}" -y`,
                { timeout: 120000, stdio: "pipe" }
            );

            segments.push(segPath);
            accumulatedDuration += segDuration;

            // Cleanup raw download
            if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
        } catch (err: any) {
            console.warn(`[StockVideo] Failed to process video ${video.id}: ${err.message}`);
            if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
        }
    }

    if (segments.length === 0) {
        console.warn("[StockVideo] No segments processed");
        return false;
    }

    // If we still need more duration, loop existing segments
    while (accumulatedDuration < duration && segments.length > 0) {
        for (const seg of [...segments]) {
            if (accumulatedDuration >= duration) break;
            const loopPath = path.join(dir, `stock-loop-${segments.length}.mp4`);
            fs.copyFileSync(seg, loopPath);
            segments.push(loopPath);
            accumulatedDuration += targetSegmentDuration;
        }
    }

    // Concatenate all segments
    if (segments.length === 1) {
        fs.copyFileSync(segments[0], outputPath);
    } else {
        const concatListPath = path.join(dir, "stock-concat.txt");
        const concatContent = segments.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n");
        fs.writeFileSync(concatListPath, concatContent);

        execSync(
            `ffmpeg -f concat -safe 0 -i "${concatListPath}" ` +
            `-c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p ` +
            `-t ${duration} "${outputPath}" -y`,
            { timeout: 600000, stdio: "pipe" }
        );
    }

    // Cleanup
    for (const seg of segments) {
        if (fs.existsSync(seg)) fs.unlinkSync(seg);
    }

    console.log(`[StockVideo] Generated ${duration}s filler from ${segments.length} clips → ${outputPath}`);
    return true;
}
