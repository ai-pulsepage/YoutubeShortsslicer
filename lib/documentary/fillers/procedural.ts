/**
 * Procedural Animation Filler Generator
 *
 * Creates abstract animated backgrounds using FFmpeg's built-in generators.
 * No external assets needed — purely code-generated visuals.
 */

import { execSync } from "child_process";
import path from "path";
import fs from "fs";

export type ProceduralStyle = "mandelbrot" | "plasma" | "gradient" | "particles";

/**
 * Generate procedural animation filler video.
 *
 * @param outputPath - Where to write the output MP4
 * @param duration - Total filler duration needed in seconds
 * @param style - Visual style (mandelbrot, plasma, gradient, particles)
 * @param width - Video width
 * @param height - Video height
 */
export async function generateProceduralFiller(
    outputPath: string,
    duration: number,
    style: ProceduralStyle = "mandelbrot",
    width = 1280,
    height = 720,
): Promise<void> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let filterInput: string;

    switch (style) {
        case "mandelbrot":
            // Zooming fractal — mesmerizing cosmic feel
            filterInput = `mandelbrot=s=${width}x${height}:rate=24:maxiter=200`;
            break;

        case "plasma":
            // Cell automaton — organic flowing patterns
            filterInput = `cellauto=s=${width}x${height}:rate=24:rule=110`;
            break;

        case "gradient":
            // Slowly rotating color gradients
            filterInput = `color=s=${width}x${height}:rate=24:c=black,hue=H=2*PI*t/30`;
            break;

        case "particles":
            // Life-like particle simulation
            filterInput = `life=s=${width}x${height}:rate=24:rule=B368/S245:mold=10:death_color=#330033:life_color=#AAFFAA`;
            break;

        default:
            filterInput = `mandelbrot=s=${width}x${height}:rate=24:maxiter=200`;
    }

    try {
        execSync(
            `ffmpeg -f lavfi -i "${filterInput}" ` +
            `-t ${duration} -c:v libx264 -preset fast -pix_fmt yuv420p "${outputPath}" -y`,
            { timeout: Math.max(duration * 5000, 300000), stdio: "pipe" }
        );
    } catch (err: any) {
        // Fallback to simple mandelbrot if complex filter fails
        console.warn(`[Procedural] Style '${style}' failed, falling back to mandelbrot: ${err.message}`);
        execSync(
            `ffmpeg -f lavfi -i "mandelbrot=s=${width}x${height}:rate=24:maxiter=200" ` +
            `-t ${duration} -c:v libx264 -preset fast -pix_fmt yuv420p "${outputPath}" -y`,
            { timeout: Math.max(duration * 5000, 300000), stdio: "pipe" }
        );
    }

    console.log(`[Procedural] Generated ${duration}s '${style}' filler → ${outputPath}`);
}

/**
 * Pick a procedural style based on scene mood/context.
 */
export function pickProceduralStyle(mood?: string): ProceduralStyle {
    if (!mood) return "mandelbrot";
    const m = mood.toLowerCase();
    if (m.includes("cosmic") || m.includes("wonder") || m.includes("mystery")) return "mandelbrot";
    if (m.includes("organic") || m.includes("life") || m.includes("nature")) return "plasma";
    if (m.includes("calm") || m.includes("warm") || m.includes("gentle")) return "gradient";
    if (m.includes("science") || m.includes("quantum") || m.includes("neural")) return "particles";
    return "mandelbrot";
}
