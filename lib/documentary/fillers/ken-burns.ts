/**
 * Ken Burns Filler Generator
 *
 * Creates slow zoom/pan animations from still images using FFmpeg's zoompan filter.
 * Used to fill visual gaps between scene clips while narration plays.
 *
 * Each image holds for a minimum of 12 seconds with a slow, cinematic zoom
 * to avoid the "jittery slideshow" effect of rapid image cycling.
 */

import { execSync } from "child_process";
import path from "path";
import fs from "fs";

const MIN_SEGMENT_DURATION = 12; // minimum seconds per image — cinematic hold

/**
 * Generate a Ken Burns filler video from asset images.
 *
 * @param imagePaths - Array of local image file paths (ideally 1-2 per scene)
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

    // Calculate per-image duration: must be at least MIN_SEGMENT_DURATION
    // Use fewer images rather than showing each one briefly
    const maxImages = Math.max(1, Math.floor(duration / MIN_SEGMENT_DURATION));
    const usedImages = imagePaths.slice(0, maxImages);
    const segmentDuration = duration / usedImages.length;

    console.log(`[KenBurns] ${usedImages.length} images × ${segmentDuration.toFixed(1)}s each = ${duration}s total`);

    const segments: string[] = [];

    for (let i = 0; i < usedImages.length; i++) {
        const imgPath = usedImages[i];
        const segPath = path.join(dir, `kb-segment-${i}.mp4`);
        const frames = Math.ceil(segmentDuration * 24);

        // Alternate between slow zoom-in and slow zoom-out with gentle pan
        // Zoom rate 0.001 = very slow, cinematic (was 0.002 = too fast/jittery)
        let zoomEffect: string;
        if (i % 3 === 0) {
            // Slow zoom in, centered
            zoomEffect = `zoompan=z='min(zoom+0.001,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:fps=24:s=${width}x${height}`;
        } else if (i % 3 === 1) {
            // Slow zoom out from 1.25x
            zoomEffect = `zoompan=z='if(eq(on,1),1.25,max(zoom-0.001,1))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:fps=24:s=${width}x${height}`;
        } else {
            // Slow pan left-to-right with slight zoom
            zoomEffect = `zoompan=z='min(zoom+0.0005,1.15)':x='if(eq(on,1),0,min(x+1,iw-iw/zoom))':y='ih/2-(ih/zoom/2)':d=${frames}:fps=24:s=${width}x${height}`;
        }

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

    // Concatenate segments (or copy if only one)
    if (segments.length === 1) {
        fs.copyFileSync(segments[0], outputPath);
    } else {
        const concatListPath = path.join(dir, "kb-concat.txt");
        const concatContent = segments.map((p) => `file '${p.replace(/\\\\/g, "/")}'`).join("\n");
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

    console.log(`[KenBurns] Generated ${duration}s filler (${segments.length} images) → ${outputPath}`);
}
