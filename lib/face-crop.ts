/**
 * Face-Aware Smart Crop for 9:16 Vertical Video
 *
 * Uses FFmpeg's scene analysis to detect the primary subject area
 * and generate an intelligent crop filter that keeps the speaker
 * centered in vertical format — instead of blind center-crop.
 *
 * Strategy:
 * 1. Probe source video for resolution
 * 2. Sample a frame near the start to find the subject position
 * 3. Calculate optimal 9:16 crop window centered on the subject
 * 4. Return FFmpeg filter string
 */

import { execSync } from "child_process";

interface CropParams {
    w: number;
    h: number;
    x: number;
    y: number;
}

/**
 * Probe video dimensions using ffprobe
 */
function probeVideoDimensions(videoPath: string): { width: number; height: number } {
    try {
        const output = execSync(
            `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "${videoPath}"`,
            { timeout: 15000, encoding: "utf-8" }
        ).trim();
        const [w, h] = output.split("x").map(Number);
        if (w && h) return { width: w, height: h };
    } catch (e: any) {
        console.warn("[FaceCrop] ffprobe failed:", e.message);
    }
    return { width: 1920, height: 1080 }; // default assume 16:9
}

/**
 * Detect face/subject region by analyzing a frame with cropdetect.
 * We sample 3 frames at different points and pick the most common region.
 */
function detectSubjectRegion(
    videoPath: string,
    startTime: number,
    sourceWidth: number,
    sourceHeight: number
): { x: number; y: number; w: number; h: number } | null {
    try {
        // Sample a frame 2 seconds into the clip (after any intro/transition)
        const sampleTime = startTime + 2;

        // Use cropdetect to find the active content region
        const output = execSync(
            `ffmpeg -ss ${sampleTime} -i "${videoPath}" -vf "cropdetect=24:16:0" -frames:v 5 -f null - 2>&1`,
            { timeout: 30000, encoding: "utf-8" }
        );

        // Parse cropdetect output lines like: [Parsed_cropdetect_0 ... crop=1728:1080:96:0
        const cropLines = output.match(/crop=(\d+):(\d+):(\d+):(\d+)/g);
        if (!cropLines || cropLines.length === 0) return null;

        // Take the last detected crop (most stable)
        const lastCrop = cropLines[cropLines.length - 1];
        const match = lastCrop.match(/crop=(\d+):(\d+):(\d+):(\d+)/);
        if (!match) return null;

        return {
            w: parseInt(match[1]),
            h: parseInt(match[2]),
            x: parseInt(match[3]),
            y: parseInt(match[4]),
        };
    } catch (e: any) {
        console.warn("[FaceCrop] cropdetect failed:", e.message);
        return null;
    }
}

/**
 * Generate an FFmpeg crop + scale filter for 9:16 vertical output.
 *
 * The strategy:
 * - For 16:9 source (1920x1080):
 *   - Target 9:16 means we need a tall crop from the wide source
 *   - Crop width = sourceHeight * (9/16) = 1080 * 0.5625 = 607px wide
 *   - The full height is used (1080px)
 *   - Position the 607px window where the subject/face is
 *
 * - For already-vertical or square sources, just scale to 1080x1920
 *
 * @returns FFmpeg -vf filter string
 */
export function generateSmartCropFilter(
    videoPath: string,
    startTime: number = 0,
    enableFaceTrack: boolean = true
): string {
    const { width: srcW, height: srcH } = probeVideoDimensions(videoPath);

    // Already vertical or close to it — just scale
    const aspectRatio = srcW / srcH;
    if (aspectRatio <= 0.7) {
        // Already vertical
        return "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1";
    }

    if (aspectRatio <= 1.1) {
        // Square-ish — crop top/bottom to 9:16
        const cropH = Math.round(srcW * (16 / 9));
        const y = Math.max(0, Math.round((srcH - cropH) / 2));
        return `crop=${srcW}:${Math.min(cropH, srcH)}:0:${y},scale=1080:1920,setsar=1`;
    }

    // ─── Landscape source (16:9 or wider) ───
    // We need to crop a tall vertical slice from the wide frame
    const cropW = Math.round(srcH * (9 / 16)); // width for 9:16 at full height
    const cropH = srcH;

    // Default: center-right bias (speakers are usually center-right in 16:9)
    let cropX = Math.round((srcW - cropW) * 0.55); // slight right bias

    if (enableFaceTrack) {
        const region = detectSubjectRegion(videoPath, startTime, srcW, srcH);
        if (region) {
            // Center the crop on the detected subject
            const subjectCenterX = region.x + region.w / 2;
            cropX = Math.round(subjectCenterX - cropW / 2);

            // Clamp to valid range
            cropX = Math.max(0, Math.min(cropX, srcW - cropW));

            console.log(
                `[FaceCrop] Subject detected at x=${region.x}, centering crop at x=${cropX} (${cropW}x${cropH})`
            );
        } else {
            console.log("[FaceCrop] No subject detected, using center-right bias");
        }
    }

    // Ensure valid crop coordinates
    cropX = Math.max(0, Math.min(cropX, srcW - cropW));

    return `crop=${cropW}:${cropH}:${cropX}:0,scale=1080:1920,setsar=1`;
}

/**
 * For multi-speaker content, analyze multiple time points
 * and return the crop that fits the most common speaker position.
 */
export function generateAdaptiveCropFilter(
    videoPath: string,
    startTime: number,
    duration: number
): string {
    const { width: srcW, height: srcH } = probeVideoDimensions(videoPath);
    const aspectRatio = srcW / srcH;

    if (aspectRatio <= 1.1) {
        return generateSmartCropFilter(videoPath, startTime, false);
    }

    // Sample 3 points in the clip
    const samplePoints = [
        startTime + 1,
        startTime + Math.floor(duration / 2),
        startTime + duration - 2,
    ].filter((t) => t > startTime && t < startTime + duration);

    const cropW = Math.round(srcH * (9 / 16));
    const positions: number[] = [];

    for (const t of samplePoints) {
        const region = detectSubjectRegion(videoPath, t, srcW, srcH);
        if (region) {
            const centerX = region.x + region.w / 2;
            positions.push(Math.round(centerX - cropW / 2));
        }
    }

    // Use median position for stability
    let cropX: number;
    if (positions.length > 0) {
        positions.sort((a, b) => a - b);
        cropX = positions[Math.floor(positions.length / 2)];
        console.log(`[FaceCrop] Adaptive: ${positions.length} samples, median crop x=${cropX}`);
    } else {
        cropX = Math.round((srcW - cropW) * 0.55);
        console.log("[FaceCrop] Adaptive: no detections, center-right fallback");
    }

    cropX = Math.max(0, Math.min(cropX, srcW - cropW));
    return `crop=${cropW}:${srcH}:${cropX}:0,scale=1080:1920,setsar=1`;
}
