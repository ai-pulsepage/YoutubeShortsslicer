import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { downloadFileFromR2, uploadFileToR2 } from "@/lib/storage";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { scenes, docId, customAudioUrl } = await req.json();
    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
        return NextResponse.json({ error: "Scenes list is required" }, { status: 400 });
    }

    // 0. Pre-validate that all visual clips and narration/song audio files exist
    const missingClips: string[] = [];
    const missingAudio: string[] = [];
    for (let idx = 0; idx < scenes.length; idx++) {
        const scene = scenes[idx];
        if (scene.visualShots && Array.isArray(scene.visualShots) && scene.visualShots.length > 0) {
            for (let sIdx = 0; sIdx < scene.visualShots.length; sIdx++) {
                const shot = scene.visualShots[sIdx];
                if (!shot.visualPath) {
                    missingClips.push(`Scene ${idx + 1} (Shot ${sIdx + 1})`);
                }
            }
        } else {
            if (!scene.visualPath) {
                missingClips.push(`Scene ${idx + 1}`);
            }
        }

        if (scene.type === "song") {
            if (!scene.sunoAudioKey) {
                missingAudio.push(`Scene ${idx + 1} (Song)`);
            }
        } else {
            if (!scene.narrationPath) {
                missingAudio.push(`Scene ${idx + 1} (Narration)`);
            }
        }
    }

    if (missingClips.length > 0 || missingAudio.length > 0) {
        const errors = [];
        if (missingClips.length > 0) {
            errors.push(`Missing video clips for: ${missingClips.join(", ")}`);
        }
        if (missingAudio.length > 0) {
            errors.push(`Missing audio narration for: ${missingAudio.join(", ")}`);
        }
        return NextResponse.json({
            error: "Incomplete scene assets",
            details: `Cannot compile: ${errors.join(". ")}. Please generate all visual shots and audio tracks first.`
        }, { status: 400 });
    }

    const moneyPrinterUrl = process.env.MONEY_PRINTER_URL || "http://localhost:8085";
    const tempDir = path.join(os.tmpdir(), `story-compile-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
        console.log(`[Compile] Starting compilation for docId ${docId || "new"} with ${scenes.length} scenes`);
        
        const sceneFinalVideos: string[] = [];

        // 1. Process each scene
        for (let idx = 0; idx < scenes.length; idx++) {
            const scene = scenes[idx];
            console.log(`[Compile] Processing scene ${idx + 1}/${scenes.length} (${scene.type})`);

            const sceneAudioPath = path.join(tempDir, `scene-${idx}-audio.mp3`);
            const sceneVideoInputPath = path.join(tempDir, `scene-${idx}-video-in.mp4`);
            const sceneVideoLoopedPath = path.join(tempDir, `scene-${idx}-video-looped.mp4`);
            const sceneFinalVideoPath = path.join(tempDir, `scene-${idx}-final.mp4`);

            // A. Retrieve Visual Video Clip from R2 (Support Multi-Shot Sequence)
            if (scene.visualShots && Array.isArray(scene.visualShots) && scene.visualShots.length > 0) {
                console.log(`[Compile] Processing multi-shot sequence for scene ${idx + 1}: ${scene.visualShots.length} shots`);
                const localShotPaths: string[] = [];

                for (let sIdx = 0; sIdx < scene.visualShots.length; sIdx++) {
                    const shot = scene.visualShots[sIdx];
                    if (!shot.visualPath) {
                        throw new Error(`Scene ${idx + 1} Shot ${sIdx + 1} has no generated video clip path`);
                    }
                    const localShotPath = path.join(tempDir, `scene-${idx}-shot-${sIdx}.mp4`);
                    console.log(`[Compile] Downloading shot ${sIdx + 1}/${scene.visualShots.length}: ${shot.visualPath}`);
                    await downloadFileFromR2(shot.visualPath, localShotPath);
                    localShotPaths.push(localShotPath);
                }

                // Concatenate shots together first using concat demuxer
                const shotsConcatTxtPath = path.join(tempDir, `scene-${idx}-shots-concat.txt`);
                const concatContent = localShotPaths.map(p => `file '${p.replace(/\\/g, "/")}'`).join("\n");
                fs.writeFileSync(shotsConcatTxtPath, concatContent);

                console.log(`[Compile] Concatenating ${localShotPaths.length} shots for scene ${idx + 1}`);
                execSync(
                    `ffmpeg -f concat -safe 0 -i "${shotsConcatTxtPath}" -c copy "${sceneVideoInputPath}" -y`,
                    { encoding: "utf8" }
                );
            } else {
                // Fallback to single visual clip
                if (!scene.visualPath) {
                    throw new Error(`Scene ${idx + 1} has no generated video clip path`);
                }
                console.log(`[Compile] Downloading visual clip: ${scene.visualPath}`);
                await downloadFileFromR2(scene.visualPath, sceneVideoInputPath);
            }

            // B. Generate or Retrieve Audio for the Scene
            let duration = 5.0; // default fallback duration in seconds

            if (scene.narrationPath) {
                // If a card-level voiceover was pre-generated (Option B), download it
                console.log(`[Compile] Downloading pre-generated voice: ${scene.narrationPath}`);
                await downloadFileFromR2(scene.narrationPath, sceneAudioPath);

                // Get audio duration using ffprobe
                const ffprobeRes = execSync(
                    `ffprobe -i "${sceneAudioPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
                    { encoding: "utf8" }
                );
                duration = parseFloat(ffprobeRes.trim()) || 5.0;
            } else if (scene.type === "song" && scene.sunoAudioKey) {
                // If it is a song segment and user uploaded a custom Suno audio key, download it
                console.log(`[Compile] Downloading Suno audio: ${scene.sunoAudioKey}`);
                await downloadFileFromR2(scene.sunoAudioKey, sceneAudioPath);
                
                // Get audio duration using ffprobe
                const ffprobeRes = execSync(
                    `ffprobe -i "${sceneAudioPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
                    { encoding: "utf8" }
                );
                duration = parseFloat(ffprobeRes.trim()) || 5.0;
            } else {
                throw new Error(`Scene ${idx + 1} is missing pre-generated narration audio. Please generate narration before compiling!`);
            }

            console.log(`[Compile] Scene ${idx + 1} audio duration resolved: ${duration.toFixed(2)}s`);

            // C. Loop the visual clip to match the audio duration
            // -stream_loop -1 loops the video infinitely, capped at the duration length
            execSync(
                `ffmpeg -stream_loop -1 -i "${sceneVideoInputPath}" -t ${duration} -c:v libx264 -preset fast -crf 23 -an "${sceneVideoLoopedPath}" -y`,
                { encoding: "utf8" }
            );

            // D. Combine the looped video and voiceover/song audio track, muting the original video track completely
            execSync(
                `ffmpeg -i "${sceneVideoLoopedPath}" -i "${sceneAudioPath}" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 128k "${sceneFinalVideoPath}" -y`,
                { encoding: "utf8" }
            );

            sceneFinalVideos.push(sceneFinalVideoPath);
        }

        // 2. Concatenate all scene final videos
        const concatTxtPath = path.join(tempDir, "concat.txt");
        const concatContent = sceneFinalVideos.map(v => `file '${v.replace(/\\/g, "/")}'`).join("\n");
        fs.writeFileSync(concatTxtPath, concatContent);

        const mergedVideoPath = path.join(tempDir, "merged.mp4");
        console.log(`[Compile] Merging ${sceneFinalVideos.length} scene videos into final output (re-encoding for compatibility)...`);
        execSync(
            `ffmpeg -f concat -safe 0 -i "${concatTxtPath}" -c:v libx264 -preset fast -crf 22 -c:a aac -b:a 128k "${mergedVideoPath}" -y`,
            { encoding: "utf8" }
        );

        // 3. Upload compiled video to R2
        const finalR2Key = `animated/renders/${session.user.id}/${docId || Date.now()}/final.mp4`;
        console.log(`[Compile] Uploading final output to R2: ${finalR2Key}`);
        await uploadFileToR2(mergedVideoPath, finalR2Key, "video/mp4");

        // Clean up temporary workspace directory
        fs.rmSync(tempDir, { recursive: true, force: true });

        // Update target Documentary status if present
        if (docId) {
            await prisma.documentary.update({
                where: { id: docId },
                data: {
                    status: "APPROVED",
                    finalVideoPath: finalR2Key,
                    totalDuration: scenes.length * 5.0 // approximate default, actual matches duration sum
                }
            });
        }

        return NextResponse.json({
            success: true,
            videoUrl: finalR2Key
        });

    } catch (err: any) {
        console.error("[Compile] Process failed:", err.message);
        fs.rmSync(tempDir, { recursive: true, force: true });
        return NextResponse.json({ error: "Compilation failed", details: err.message }, { status: 500 });
    }
}
