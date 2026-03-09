/**
 * Documentary Assembly Pipeline
 *
 * Combines generated video clips + TTS narration + SFX + music + visual filler.
 *
 * Steps:
 * 1. Generate narration audio per scene via ElevenLabs / XTTS v2
 * 2. Fetch ambient SFX from Freesound API
 * 3. Generate background music via MusicGen (RunPod)
 * 4. Calculate narration duration → determine filler needed
 * 5. Download all scene clips from R2
 * 6. Generate filler visuals (Ken Burns / Procedural / Stock Video)
 * 7. Interleave clips + filler to fill narration duration
 * 8. Mix 3-track audio (narration + SFX + music) with scene video
 * 9. Concatenate all scenes into final documentary
 * 10. Upload final MP4 to R2
 */

import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { prisma } from "@/lib/prisma";
import { generateVoiceover } from "@/lib/tts";
import type { TtsEngine, NarratorStyle } from "@/lib/tts";
import { uploadFileToR2, downloadFileFromR2, uploadBufferToR2 } from "@/lib/storage";
import { generateKenBurnsFiller } from "./fillers/ken-burns";
import { generateProceduralFiller, pickProceduralStyle } from "./fillers/procedural";
import { generateStockVideoFiller } from "./fillers/stock-video";
import { fetchFreesoundSfx } from "@/lib/audio/freesound";
import { generateBackgroundMusic } from "@/lib/audio/musicgen";

const TEMP_DIR = path.join(os.tmpdir(), "documentary-assembly");

/**
 * Get narration audio duration in seconds via ffprobe.
 */
function getAudioDuration(audioPath: string): number {
    try {
        const result = execSync(
            `ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`,
            { timeout: 15000, stdio: "pipe" }
        ).toString().trim();
        return parseFloat(result) || 0;
    } catch {
        return 0;
    }
}

/**
 * Get video duration in seconds via ffprobe.
 */
function getVideoDuration(videoPath: string): number {
    try {
        const result = execSync(
            `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`,
            { timeout: 15000, stdio: "pipe" }
        ).toString().trim();
        return parseFloat(result) || 0;
    } catch {
        return 0;
    }
}

/**
 * Generate filler video based on the documentary's filler mode.
 */
async function generateFiller(
    fillerMode: string,
    outputPath: string,
    duration: number,
    sceneDir: string,
    assetImagePaths: string[],
    narrationText: string,
    sceneTitle: string,
    sceneMood?: string,
): Promise<void> {
    console.log(`[Assembly]   Generating ${duration}s of '${fillerMode}' filler...`);

    switch (fillerMode) {
        case "kenburns": {
            if (assetImagePaths.length === 0) {
                // Fallback to procedural if no images
                await generateProceduralFiller(outputPath, duration, pickProceduralStyle(sceneMood));
            } else {
                await generateKenBurnsFiller(assetImagePaths, outputPath, duration);
            }
            break;
        }

        case "procedural": {
            const style = pickProceduralStyle(sceneMood);
            await generateProceduralFiller(outputPath, duration, style);
            break;
        }

        case "stock": {
            const success = await generateStockVideoFiller(narrationText, outputPath, duration, sceneTitle);
            if (!success) {
                // Fallback to Ken Burns if stock fails
                if (assetImagePaths.length > 0) {
                    await generateKenBurnsFiller(assetImagePaths, outputPath, duration);
                } else {
                    await generateProceduralFiller(outputPath, duration, pickProceduralStyle(sceneMood));
                }
            }
            break;
        }

        case "kenburns+stock": {
            // Split duration: 60% stock, 40% Ken Burns
            const stockDuration = Math.ceil(duration * 0.6);
            const kbDuration = duration - stockDuration;

            const stockPath = path.join(sceneDir, "filler-stock-part.mp4");
            const kbPath = path.join(sceneDir, "filler-kb-part.mp4");

            // Try stock first
            const stockSuccess = await generateStockVideoFiller(narrationText, stockPath, stockDuration, sceneTitle);

            if (stockSuccess && assetImagePaths.length > 0) {
                // Both modes succeeded — concatenate
                await generateKenBurnsFiller(assetImagePaths, kbPath, kbDuration);

                const concatList = path.join(sceneDir, "filler-mix-concat.txt");
                fs.writeFileSync(concatList, [
                    `file '${stockPath.replace(/\\/g, "/")}'`,
                    `file '${kbPath.replace(/\\/g, "/")}'`,
                ].join("\n"));

                execSync(
                    `ffmpeg -f concat -safe 0 -i "${concatList}" ` +
                    `-c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p ` +
                    `-t ${duration} "${outputPath}" -y`,
                    { timeout: 600000, stdio: "pipe" }
                );
            } else if (stockSuccess) {
                fs.copyFileSync(stockPath, outputPath);
            } else if (assetImagePaths.length > 0) {
                await generateKenBurnsFiller(assetImagePaths, outputPath, duration);
            } else {
                await generateProceduralFiller(outputPath, duration, pickProceduralStyle(sceneMood));
            }
            break;
        }

        default: {
            // Default to Ken Burns
            if (assetImagePaths.length > 0) {
                await generateKenBurnsFiller(assetImagePaths, outputPath, duration);
            } else {
                await generateProceduralFiller(outputPath, duration, pickProceduralStyle(sceneMood));
            }
        }
    }
}

/**
 * Run the full assembly pipeline for a documentary
 */
export async function assembleDocumentary(documentaryId: string): Promise<string> {
    console.log(`[Assembly] Starting for ${documentaryId}...`);

    // Ensure temp dir
    const workDir = path.join(TEMP_DIR, documentaryId);
    if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

    try {
        // Load full documentary data
        const doc = await prisma.documentary.findUnique({
            where: { id: documentaryId },
            include: {
                scenes: {
                    orderBy: { sceneIndex: "asc" },
                    include: {
                        shots: { orderBy: { shotIndex: "asc" } },
                    },
                },
                assets: true,
            },
        });

        if (!doc) throw new Error("Documentary not found");

        const fillerMode = doc.fillerMode || "kenburns";
        console.log(`[Assembly] Filler mode: ${fillerMode}`);

        // Mark as assembling
        await prisma.documentary.update({
            where: { id: documentaryId },
            data: { status: "ASSEMBLING" },
        });

        // Download all asset images for Ken Burns filler
        const assetImagePaths: string[] = [];
        const assetDir = path.join(workDir, "assets");
        if (!fs.existsSync(assetDir)) fs.mkdirSync(assetDir, { recursive: true });

        for (const asset of doc.assets) {
            if (asset.imagePath) {
                const assetFile = path.join(assetDir, `asset-${asset.id}.png`);
                try {
                    await downloadFileFromR2(asset.imagePath, assetFile);
                    assetImagePaths.push(assetFile);
                } catch (err: any) {
                    console.warn(`[Assembly] Failed to download asset ${asset.id}: ${err.message}`);
                }
            }
        }

        console.log(`[Assembly] Downloaded ${assetImagePaths.length} asset images for filler`);

        const assembledScenePaths: string[] = [];

        // ─── Process each scene ──────────────────────────
        for (const scene of doc.scenes) {
            console.log(`[Assembly] Scene ${scene.sceneIndex + 1}/${doc.scenes.length}: "${scene.title}"`);

            const sceneDir = path.join(workDir, `scene-${scene.sceneIndex}`);
            if (!fs.existsSync(sceneDir)) fs.mkdirSync(sceneDir, { recursive: true });

            // Step 1: Generate narration audio for this scene
            let narrationPath: string | null = null;
            let narrationDuration = 0;

            if (scene.narrationText) {
                console.log(`[Assembly]   Generating TTS narration (${scene.narrationText.length} chars)...`);
                try {
                    const ttsEngine = (doc.ttsEngine || "elevenlabs") as TtsEngine;
                    const narratorStyle = (doc.narratorStyle || "sleep") as NarratorStyle;

                    const audioBuffer = await generateVoiceover({
                        text: scene.narrationText,
                        engine: ttsEngine,
                        voiceId: doc.ttsVoiceId || doc.voiceId || "Rachel",
                        narratorStyle,
                    });

                    narrationPath = path.join(sceneDir, "narration.wav");
                    fs.writeFileSync(narrationPath, audioBuffer);

                    // Get exact narration duration
                    narrationDuration = getAudioDuration(narrationPath);
                    console.log(`[Assembly]   TTS done (${ttsEngine}/${narratorStyle}) → ${narrationDuration.toFixed(1)}s`);

                    // Upload narration to R2
                    const narrationR2Key = `documentaries/${documentaryId}/scenes/${scene.id}/narration.wav`;
                    await uploadBufferToR2(audioBuffer, narrationR2Key, "audio/wav");

                    await prisma.docScene.update({
                        where: { id: scene.id },
                        data: { narrationPath: narrationR2Key },
                    });
                } catch (ttsErr: any) {
                    console.warn(`[Assembly]   TTS failed for scene ${scene.sceneIndex}: ${ttsErr.message}`);
                }
            }

            // Step 1b: Fetch ambient SFX from Freesound
            let sfxPath: string | null = null;
            try {
                sfxPath = await fetchFreesoundSfx(
                    scene.title || `Scene ${scene.sceneIndex + 1}`,
                    sceneDir,
                    Math.max(10, narrationDuration),
                );
                if (sfxPath) console.log(`[Assembly]   SFX loaded: ${sfxPath}`);
            } catch (sfxErr: any) {
                console.warn(`[Assembly]   SFX fetch failed: ${sfxErr.message}`);
            }

            // Step 1c: Generate background music via MusicGen
            let musicPath: string | null = null;
            try {
                musicPath = await generateBackgroundMusic(
                    scene.title || "ambient",
                    Math.max(10, narrationDuration),
                    sceneDir,
                );
                if (musicPath) console.log(`[Assembly]   Music generated: ${musicPath}`);
            } catch (musicErr: any) {
                console.warn(`[Assembly]   Music generation failed: ${musicErr.message}`);
            }

            // Step 2: Download scene clips
            const shotPaths: string[] = [];
            let totalClipDuration = 0;

            for (const shot of scene.shots) {
                if (!shot.clipPath) {
                    console.warn(`[Assembly]   Shot ${shot.shotIndex} missing clip, skipping`);
                    continue;
                }

                const shotFile = path.join(sceneDir, `shot-${shot.shotIndex}.mp4`);
                await downloadFileFromR2(shot.clipPath, shotFile);

                const clipDuration = getVideoDuration(shotFile);
                totalClipDuration += clipDuration;
                shotPaths.push(shotFile);
            }

            if (shotPaths.length === 0 && narrationDuration === 0) {
                console.warn(`[Assembly]   No clips or narration for scene ${scene.sceneIndex}, skipping`);
                continue;
            }

            // Step 3: Calculate filler needed
            // In narration-only mode (zero shots), filler fills the ENTIRE narration duration
            const isNarrationOnly = shotPaths.length === 0 && narrationDuration > 0;
            const fillerDuration = Math.max(0, narrationDuration - totalClipDuration);
            console.log(`[Assembly]   ${isNarrationOnly ? "[Narration-Only] " : ""}Clips: ${totalClipDuration.toFixed(1)}s | Narration: ${narrationDuration.toFixed(1)}s | Filler needed: ${fillerDuration.toFixed(1)}s`);

            // Step 4: Generate filler if needed
            let fillerPath: string | null = null;
            if (fillerDuration > 2) {
                fillerPath = path.join(sceneDir, "filler.mp4");

                // Get scene-specific mood from first shot (or null for narration-only)
                const sceneMood = scene.shots[0]?.mood || undefined;

                // In narration-only mode, prefer stock video or kenburns+stock
                // so Pexels provides all visuals driven by narration keywords
                const effectiveFillerMode = isNarrationOnly
                    ? (fillerMode === "procedural" ? "kenburns+stock" : fillerMode)
                    : fillerMode;

                await generateFiller(
                    effectiveFillerMode,
                    fillerPath,
                    fillerDuration,
                    sceneDir,
                    assetImagePaths,
                    scene.narrationText || "",
                    scene.title || `Scene ${scene.sceneIndex + 1}`,
                    sceneMood,
                );
            }

            // Step 5: Interleave clips + filler → scene video
            const sceneVideoPath = path.join(sceneDir, "scene-video.mp4");
            const videoParts: string[] = [];

            // Pattern: [Clip 1] → [Filler] → [Clip 2] → [Filler] → ...
            // But if filler exists, place clips at start and filler fills the rest
            if (shotPaths.length > 0) {
                videoParts.push(...shotPaths);
            }
            if (fillerPath && fs.existsSync(fillerPath)) {
                videoParts.push(fillerPath);
            }

            if (videoParts.length === 0) continue;

            if (videoParts.length === 1) {
                fs.copyFileSync(videoParts[0], sceneVideoPath);
            } else {
                // Need to re-encode for consistent format before concat
                const normalizedParts: string[] = [];
                for (let i = 0; i < videoParts.length; i++) {
                    const normPath = path.join(sceneDir, `norm-${i}.mp4`);
                    execSync(
                        `ffmpeg -i "${videoParts[i]}" -c:v libx264 -preset fast -crf 22 ` +
                        `-vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,fps=24" ` +
                        `-pix_fmt yuv420p -an "${normPath}" -y`,
                        { timeout: 600000, stdio: "pipe" }
                    );
                    normalizedParts.push(normPath);
                }

                const concatListPath = path.join(sceneDir, "scene-concat.txt");
                const concatContent = normalizedParts.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n");
                fs.writeFileSync(concatListPath, concatContent);

                execSync(
                    `ffmpeg -f concat -safe 0 -i "${concatListPath}" -c copy "${sceneVideoPath}" -y`,
                    { timeout: 600000, stdio: "pipe" }
                );
            }

            // Step 6: Mix 3-track audio (narration + SFX + music) with scene video
            const sceneOutputPath = path.join(sceneDir, "scene-final.mp4");
            const hasNarration = narrationPath && fs.existsSync(narrationPath);
            const hasSfx = sfxPath && fs.existsSync(sfxPath);
            const hasMusic = musicPath && fs.existsSync(musicPath);

            if (hasNarration || hasSfx || hasMusic) {
                try {
                    // Build FFmpeg command for multi-track audio mixing
                    const inputs: string[] = [`-i "${sceneVideoPath}"`];
                    const filters: string[] = [];
                    let audioIdx = 1;

                    if (hasNarration) {
                        inputs.push(`-i "${narrationPath}"`);
                        filters.push(`[${audioIdx}:a]volume=1.0[narr]`);
                        audioIdx++;
                    }
                    if (hasSfx) {
                        inputs.push(`-i "${sfxPath}"`);
                        filters.push(`[${audioIdx}:a]volume=0.3[sfx]`);
                        audioIdx++;
                    }
                    if (hasMusic) {
                        inputs.push(`-i "${musicPath}"`);
                        filters.push(`[${audioIdx}:a]volume=0.12[music]`);
                        audioIdx++;
                    }

                    // Build amix filter
                    const trackLabels: string[] = [];
                    if (hasNarration) trackLabels.push("[narr]");
                    if (hasSfx) trackLabels.push("[sfx]");
                    if (hasMusic) trackLabels.push("[music]");

                    const trackCount = trackLabels.length;
                    if (trackCount > 1) {
                        filters.push(
                            `${trackLabels.join("")}amix=inputs=${trackCount}:duration=longest[aout]`
                        );
                    } else {
                        // Single audio track — rename to [aout]
                        const label = hasNarration ? "narr" : hasSfx ? "sfx" : "music";
                        filters.push(`[${label}]acopy[aout]`);
                    }

                    const filterComplex = filters.join(";");

                    execSync(
                        `ffmpeg ${inputs.join(" ")} ` +
                        `-filter_complex "${filterComplex}" ` +
                        `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k ` +
                        `-shortest "${sceneOutputPath}" -y`,
                        { timeout: 600000, stdio: "pipe" }
                    );
                } catch (mixErr: any) {
                    console.warn(`[Assembly]   Audio mixing failed: ${mixErr.message}`);
                    // Fallback: just narration if multi-track fails
                    if (hasNarration) {
                        try {
                            execSync(
                                `ffmpeg -i "${sceneVideoPath}" -i "${narrationPath}" ` +
                                `-map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k ` +
                                `-shortest "${sceneOutputPath}" -y`,
                                { timeout: 600000, stdio: "pipe" }
                            );
                        } catch {
                            fs.copyFileSync(sceneVideoPath, sceneOutputPath);
                        }
                    } else {
                        fs.copyFileSync(sceneVideoPath, sceneOutputPath);
                    }
                }
            } else {
                fs.copyFileSync(sceneVideoPath, sceneOutputPath);
            }

            // Upload assembled scene to R2
            const sceneR2Key = `documentaries/${documentaryId}/scenes/${scene.id}/assembled.mp4`;
            await uploadFileToR2(sceneOutputPath, sceneR2Key, "video/mp4");

            await prisma.docScene.update({
                where: { id: scene.id },
                data: { assembledPath: sceneR2Key },
            });

            assembledScenePaths.push(sceneOutputPath);
            console.log(`[Assembly]   Scene ${scene.sceneIndex + 1} assembled → ${sceneR2Key}`);
        }

        // ─── Step 7: Final concat of all scenes ──────────
        if (assembledScenePaths.length === 0) {
            throw new Error("No scenes assembled — cannot create final documentary");
        }

        const finalOutputPath = path.join(workDir, "documentary-final.mp4");

        if (assembledScenePaths.length === 1) {
            fs.copyFileSync(assembledScenePaths[0], finalOutputPath);
        } else {
            const finalConcatPath = path.join(workDir, "final-concat.txt");
            const finalConcatContent = assembledScenePaths
                .map((p) => `file '${p.replace(/\\/g, "/")}'`)
                .join("\n");
            fs.writeFileSync(finalConcatPath, finalConcatContent);

            execSync(
                `ffmpeg -f concat -safe 0 -i "${finalConcatPath}" ` +
                `-c:v libx264 -preset fast -crf 22 -c:a aac -b:a 192k ` +
                `-movflags +faststart "${finalOutputPath}" -y`,
                { timeout: 1800000 }
            );
        }

        // ─── Step 8: Upload final documentary to R2 ──────
        const finalR2Key = `documentaries/${documentaryId}/final.mp4`;
        console.log(`[Assembly] Uploading final documentary...`);
        await uploadFileToR2(finalOutputPath, finalR2Key, "video/mp4");

        const finalSize = fs.statSync(finalOutputPath).size;

        let totalDuration = 0;
        try {
            const probeResult = execSync(
                `ffprobe -v error -show_entries format=duration -of csv=p=0 "${finalOutputPath}"`,
                { timeout: 30000 }
            ).toString().trim();
            totalDuration = parseFloat(probeResult) || 0;
        } catch {
            totalDuration = doc.scenes.length * 120;
        }

        // Update documentary record
        await prisma.documentary.update({
            where: { id: documentaryId },
            data: {
                status: "REVIEW",
                finalVideoPath: finalR2Key,
                totalDuration: totalDuration,
            },
        });

        // Cleanup temp files
        fs.rmSync(workDir, { recursive: true, force: true });

        console.log(`[Assembly] ✅ Complete: ${documentaryId} → ${finalR2Key} (${Math.round(totalDuration / 60)}min, ${Math.round(finalSize / 1024 / 1024)}MB)`);
        return finalR2Key;

    } catch (error: any) {
        console.error(`[Assembly] ❌ Failed for ${documentaryId}:`, error.message);

        await prisma.documentary.update({
            where: { id: documentaryId },
            data: { status: "FAILED", errorMsg: `Assembly failed: ${error.message}` },
        });

        if (fs.existsSync(workDir)) {
            fs.rmSync(workDir, { recursive: true, force: true });
        }

        throw error;
    }
}

/**
 * Check if a documentary is ready for assembly.
 *
 * Two valid states:
 *   1. All shots have clips generated (normal mode - RunPod was used)
 *   2. ZERO shots but scenes have narration text (narration-only mode - stock footage)
 */
export async function isReadyForAssembly(documentaryId: string): Promise<{
    ready: boolean;
    totalShots: number;
    completedShots: number;
    missingShots: number;
    narrationOnly: boolean;
}> {
    const doc = await prisma.documentary.findUnique({
        where: { id: documentaryId },
        include: {
            scenes: {
                include: {
                    shots: { select: { id: true, clipPath: true } },
                },
            },
        },
    });

    if (!doc) return { ready: false, totalShots: 0, completedShots: 0, missingShots: 0, narrationOnly: false };

    const allShots = doc.scenes.flatMap((s) => s.shots);
    const totalShots = allShots.length;
    const completedShots = allShots.filter((s) => s.clipPath).length;
    const missingShots = totalShots - completedShots;

    // Narration-only mode: zero shots, but at least one scene has narration text
    const hasNarration = doc.scenes.some((s) => s.narrationText && s.narrationText.trim().length > 0);
    const narrationOnly = totalShots === 0 && hasNarration;

    // Ready if: (a) all shots have clips, OR (b) narration-only mode with text
    const ready = (totalShots > 0 && missingShots === 0) || narrationOnly;

    return {
        ready,
        totalShots,
        completedShots,
        missingShots,
        narrationOnly,
    };
}
