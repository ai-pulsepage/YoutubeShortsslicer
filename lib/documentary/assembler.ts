/**
 * Documentary Assembly Pipeline
 *
 * Combines generated video clips + TTS narration into finished documentary.
 *
 * Steps:
 * 1. Generate narration audio per scene via Kokoro TTS
 * 2. Download all scene clips from R2
 * 3. Concatenate clips within each scene (FFmpeg concat)
 * 4. Mix narration audio with scene video
 * 5. Concatenate all scenes into final documentary
 * 6. Upload final MP4 to R2
 */

import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { prisma } from "@/lib/prisma";
import { generateVoiceover } from "@/lib/tts";
import { uploadFileToR2, downloadFileFromR2, uploadBufferToR2 } from "@/lib/storage";

const TEMP_DIR = path.join(os.tmpdir(), "documentary-assembly");

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
            },
        });

        if (!doc) throw new Error("Documentary not found");

        // Mark as assembling
        await prisma.documentary.update({
            where: { id: documentaryId },
            data: { status: "ASSEMBLING" },
        });

        const assembledScenePaths: string[] = [];

        // ─── Process each scene ──────────────────────────
        for (const scene of doc.scenes) {
            console.log(`[Assembly] Scene ${scene.sceneIndex + 1}/${doc.scenes.length}: "${scene.title}"`);

            const sceneDir = path.join(workDir, `scene-${scene.sceneIndex}`);
            if (!fs.existsSync(sceneDir)) fs.mkdirSync(sceneDir, { recursive: true });

            // Step 1: Generate narration audio for this scene
            let narrationPath: string | null = null;
            if (scene.narrationText) {
                console.log(`[Assembly]   Generating TTS narration (${scene.narrationText.length} chars)...`);
                try {
                    const audioBuffer = await generateVoiceover({
                        text: scene.narrationText,
                        voiceId: doc.voiceId || "bf_emma",
                        speed: 0.95, // slightly slower for documentary feel
                    });

                    narrationPath = path.join(sceneDir, "narration.wav");
                    fs.writeFileSync(narrationPath, audioBuffer);

                    // Also upload narration to R2 for future reference
                    const narrationR2Key = `documentaries/${documentaryId}/scenes/${scene.id}/narration.wav`;
                    await uploadBufferToR2(audioBuffer, narrationR2Key, "audio/wav");

                    await prisma.docScene.update({
                        where: { id: scene.id },
                        data: { narrationPath: narrationR2Key },
                    });

                    console.log(`[Assembly]   TTS done → ${narrationR2Key}`);
                } catch (ttsErr: any) {
                    console.warn(`[Assembly]   TTS failed for scene ${scene.sceneIndex}: ${ttsErr.message}`);
                }
            }

            // Step 2: Download and concatenate shots for this scene
            const shotPaths: string[] = [];
            for (const shot of scene.shots) {
                if (!shot.clipPath) {
                    console.warn(`[Assembly]   Shot ${shot.shotIndex} missing clip, skipping`);
                    continue;
                }

                const shotFile = path.join(sceneDir, `shot-${shot.shotIndex}.mp4`);
                await downloadFileFromR2(shot.clipPath, shotFile);
                shotPaths.push(shotFile);
            }

            if (shotPaths.length === 0) {
                console.warn(`[Assembly]   No clips for scene ${scene.sceneIndex}, skipping`);
                continue;
            }

            // Step 3: Concat all shots in this scene
            const sceneConcatPath = path.join(sceneDir, "scene-concat.mp4");
            if (shotPaths.length === 1) {
                // Single shot, just copy
                fs.copyFileSync(shotPaths[0], sceneConcatPath);
            } else {
                // FFmpeg concat demuxer
                const concatListPath = path.join(sceneDir, "concat.txt");
                const concatContent = shotPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n");
                fs.writeFileSync(concatListPath, concatContent);

                execSync(
                    `ffmpeg -f concat -safe 0 -i "${concatListPath}" -c copy "${sceneConcatPath}" -y`,
                    { timeout: 600000, cwd: sceneDir }
                );
            }

            // Step 4: Mix narration audio if available
            const sceneOutputPath = path.join(sceneDir, "scene-final.mp4");
            if (narrationPath && fs.existsSync(narrationPath)) {
                try {
                    // Mix: keep video audio as background (lower volume) + narration as narrator
                    execSync(
                        `ffmpeg -i "${sceneConcatPath}" -i "${narrationPath}" ` +
                        `-filter_complex "[0:a]volume=0.3[bg];[1:a]volume=1.0[narr];[bg][narr]amix=inputs=2:duration=longest:dropout_transition=3[aout]" ` +
                        `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k "${sceneOutputPath}" -y`,
                        { timeout: 600000, cwd: sceneDir }
                    );
                } catch {
                    // If audio mixing fails (e.g., no audio stream in video), just add narration as only audio
                    execSync(
                        `ffmpeg -i "${sceneConcatPath}" -i "${narrationPath}" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest "${sceneOutputPath}" -y`,
                        { timeout: 600000, cwd: sceneDir }
                    );
                }
            } else {
                fs.copyFileSync(sceneConcatPath, sceneOutputPath);
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

        // ─── Step 5: Final concat of all scenes ──────────
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

            // Re-encode to ensure consistent format for final concatenation
            execSync(
                `ffmpeg -f concat -safe 0 -i "${finalConcatPath}" ` +
                `-c:v libx264 -preset fast -crf 22 -c:a aac -b:a 192k ` +
                `-movflags +faststart "${finalOutputPath}" -y`,
                { timeout: 1800000 } // 30 min timeout for long docs
            );
        }

        // ─── Step 6: Upload final documentary to R2 ──────
        const finalR2Key = `documentaries/${documentaryId}/final.mp4`;
        console.log(`[Assembly] Uploading final documentary...`);
        await uploadFileToR2(finalOutputPath, finalR2Key, "video/mp4");

        // Get file size for metadata
        const finalSize = fs.statSync(finalOutputPath).size;

        // Get duration via ffprobe
        let totalDuration = 0;
        try {
            const probeResult = execSync(
                `ffprobe -v error -show_entries format=duration -of csv=p=0 "${finalOutputPath}"`,
                { timeout: 30000 }
            ).toString().trim();
            totalDuration = parseFloat(probeResult) || 0;
        } catch {
            // Estimate from scene count
            totalDuration = doc.scenes.length * 120; // rough estimate
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

        // Cleanup on failure too
        if (fs.existsSync(workDir)) {
            fs.rmSync(workDir, { recursive: true, force: true });
        }

        throw error;
    }
}

/**
 * Check if a documentary is ready for assembly
 * All shots must have clips generated
 */
export async function isReadyForAssembly(documentaryId: string): Promise<{
    ready: boolean;
    totalShots: number;
    completedShots: number;
    missingShots: number;
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

    if (!doc) return { ready: false, totalShots: 0, completedShots: 0, missingShots: 0 };

    const allShots = doc.scenes.flatMap((s) => s.shots);
    const totalShots = allShots.length;
    const completedShots = allShots.filter((s) => s.clipPath).length;
    const missingShots = totalShots - completedShots;

    return {
        ready: totalShots > 0 && missingShots === 0,
        totalShots,
        completedShots,
        missingShots,
    };
}
