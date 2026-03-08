/**
 * Ken Burns Filler Generator
 *
 * Creates slow zoom/pan animations from still images using FFmpeg's zoompan filter.
 * Used to fill visual gaps between scene clips while narration plays.
 */

import { execSync } from "child_process";
import path from "path";
import fs from "fs";

const SEGMENT_DURATION = 15; // seconds per image

/**
 * Generate a Ken Burns filler video from asset images.
 *
 * @param imagePaths - Array of local image file paths
 * @param outputPath - Where to write the output MP4
 * @param duration - Total filler duration needed in seconds
 * @param width - Video width (default 1280)
 * @param height - Video height (default 720)
 */
export async function generateKenBurnsFiller(
    imagePaths: string[],
    outputPath: string,
    duration: number,
    width = 1280,
    height = 720,
): Promise<void> {
    if (imagePaths.length === 0) {
        throw new Error("No images provided for Ken Burns filler");
    }

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Calculate how long each image segment should be
    const segmentDuration = Math.min(SEGMENT_DURATION, duration / imagePaths.length);
    const totalSegments = Math.ceil(duration / segmentDuration);

    // Cycle through images if we need more segments than images
    const segments: string[] = [];
    for (let i = 0; i < totalSegments; i++) {
        const imgPath = imagePaths[i % imagePaths.length];
        const segPath = path.join(dir, `kb-segment-${i}.mp4`);

        // Alternate between zoom-in and zoom-out + pan directions
        const zoomEffect = i % 2 === 0
            ? `zoompan=z='min(zoom+0.002,1.3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.ceil(segmentDuration * 24)}:fps=24:s=${width}x${height}`
            : `zoompan=z='if(eq(on,1),1.3,max(zoom-0.002,1))':x='iw/4':y='ih/4':d=${Math.ceil(segmentDuration * 24)}:fps=24:s=${width}x${height}`;

        try {
            execSync(
                `ffmpeg -loop 1 -i "${imgPath}" -vf "${zoomEffect}" ` +
                `-t ${segmentDuration} -c:v libx264 -preset fast -pix_fmt yuv420p "${segPath}" -y`,
                { timeout: 120000, stdio: "pipe" }
            );
            segments.push(segPath);
        } catch (err: any) {
            console.warn(`[KenBurns] Failed to process image ${imgPath}: ${err.message}`);
        }
    }

    if (segments.length === 0) {
        throw new Error("Ken Burns: No segments generated");
    }

    // Concatenate all segments with crossfade transitions
    if (segments.length === 1) {
        fs.copyFileSync(segments[0], outputPath);
    } else {
        const concatListPath = path.join(dir, "kb-concat.txt");
        const concatContent = segments.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n");
        fs.writeFileSync(concatListPath, concatContent);

        execSync(
            `ffmpeg -f concat -safe 0 -i "${concatListPath}" ` +
            `-c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p ` +
            `-t ${duration} "${outputPath}" -y`,
            { timeout: 600000, stdio: "pipe" }
        );
    }

    // Cleanup segment files
    for (const seg of segments) {
        if (fs.existsSync(seg)) fs.unlinkSync(seg);
    }
    const concatFile = path.join(dir, "kb-concat.txt");
    if (fs.existsSync(concatFile)) fs.unlinkSync(concatFile);

    console.log(`[KenBurns] Generated ${duration}s filler → ${outputPath}`);
}
