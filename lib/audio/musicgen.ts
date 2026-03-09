/**
 * MusicGen Background Score Generator
 *
 * Self-hosted on RunPod via Redis queue.
 * Generates ambient/mood-appropriate background music for scenes.
 * Uses facebook/musicgen-medium (~3.3GB VRAM).
 */

import { addJob, waitForJobResult } from "@/lib/queue";
import fs from "fs";
import path from "path";

/**
 * Generate background music via MusicGen on RunPod.
 * Returns local file path to the generated audio, or null on failure.
 */
export async function generateBackgroundMusic(
    mood: string,
    durationSec: number,
    outputDir: string,
): Promise<string | null> {
    try {
        // Build a music-appropriate prompt from the scene mood/title
        const prompt = buildMusicPrompt(mood);
        console.log(`[MusicGen] Generating ${durationSec}s of music: "${prompt}"`);

        // Dispatch to RunPod via Redis
        const jobId = await addJob("musicgen_generate", {
            prompt,
            duration: Math.min(durationSec, 30), // MusicGen max ~30s per generation
        });

        // Wait for result (timeout: 120s)
        const result = await waitForJobResult(jobId, 120_000);

        if (!result || result.status === "FAILED") {
            console.warn(`[MusicGen] Generation failed: ${result?.error || "timeout"}`);
            return null;
        }

        // Download from R2 URL
        if (result.output_url) {
            const musicPath = path.join(outputDir, "bg-music.wav");
            const response = await fetch(result.output_url);
            if (!response.ok) {
                console.warn("[MusicGen] Failed to download audio from R2");
                return null;
            }
            const buffer = Buffer.from(await response.arrayBuffer());
            fs.writeFileSync(musicPath, buffer);
            console.log(`[MusicGen] Generated: ${musicPath}`);
            return musicPath;
        }

        // Or base64
        if (result.audio_base64) {
            const musicPath = path.join(outputDir, "bg-music.wav");
            fs.writeFileSync(musicPath, Buffer.from(result.audio_base64, "base64"));
            return musicPath;
        }

        return null;
    } catch (err: any) {
        console.warn(`[MusicGen] Error: ${err.message}`);
        return null;
    }
}

/**
 * Build a music generation prompt from scene mood/title keywords.
 */
function buildMusicPrompt(mood: string): string {
    const lower = mood.toLowerCase();

    // Map common moods to music descriptions
    const moodMap: Record<string, string> = {
        tense: "dark atmospheric tension, low synth drones, suspenseful, cinematic",
        mysterious: "mysterious ambient, ethereal pads, soft piano, atmospheric",
        triumphant: "triumphant orchestral, brass fanfare, epic, heroic",
        sad: "melancholic piano, gentle strings, emotional, reflective",
        horror: "eerie dark ambient, dissonant strings, unsettling, horror soundtrack",
        action: "intense orchestral action, fast percussion, dramatic brass",
        calm: "soft ambient, gentle piano, peaceful, meditation, nature sounds",
        romantic: "romantic piano, warm strings, gentle, intimate",
        epic: "epic cinematic orchestral, building crescendo, powerful drums",
        sci_fi: "electronic ambient, futuristic synths, space atmosphere",
        nature: "gentle nature ambience, soft flute, peaceful, organic",
        documentary: "light documentary score, soft piano, ambient, informative",
        sleep: "very soft ambient drone, gentle, barely audible, soothing, calming",
    };

    // Try to match mood keywords
    for (const [key, prompt] of Object.entries(moodMap)) {
        if (lower.includes(key)) return prompt;
    }

    // Default: use the mood string directly as a prompt
    return `ambient cinematic background music, ${lower}, instrumental`;
}

/**
 * Generate silence audio file as fallback when MusicGen is unavailable.
 */
export function generateSilence(durationSec: number, outputPath: string): void {
    const { execSync } = require("child_process");
    try {
        execSync(
            `ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t ${durationSec} ` +
            `-c:a pcm_s16le "${outputPath}" -y`,
            { timeout: 10000, stdio: "pipe" }
        );
    } catch {
        // Write empty file if FFmpeg fails
        fs.writeFileSync(outputPath, Buffer.alloc(0));
    }
}
