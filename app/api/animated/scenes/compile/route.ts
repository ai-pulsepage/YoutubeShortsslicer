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

    const body = await req.json();
    const { docId, title: customTitle, scenes: clientScenes } = body;
    if (!docId && (!clientScenes || !Array.isArray(clientScenes))) {
        return NextResponse.json({ error: "docId or scenes list is required" }, { status: 400 });
    }

    const tempDir = path.join(os.tmpdir(), `animated-compile-${docId || Date.now()}-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
        let scenes: any[] = [];
        let projectTitle = "Kids Movie";

        if (clientScenes && Array.isArray(clientScenes) && clientScenes.length > 0) {
            scenes = clientScenes;
        } else if (docId) {
            const doc = await prisma.documentary.findUnique({
                where: { id: docId },
                include: { scenes: { orderBy: { sceneIndex: "asc" } } }
            });
            if (!doc) throw new Error("Documentary project not found");
            projectTitle = doc.title || "Kids Movie";
            scenes = doc.scenes.map(s => {
                let parsed: any = {};
                try { parsed = JSON.parse(s.searchQueries || "{}"); } catch {}
                return {
                    id: s.id,
                    text: s.narrationText || "",
                    narrationPath: s.narrationPath,
                    visualPath: s.assembledPath || parsed.visualPath,
                    type: parsed.type || "dialogue",
                    voice: parsed.voice || "en-US-AnaNeural-Female",
                    sunoAudioKey: parsed.sunoAudioKey,
                    visualShots: parsed.visualShots || []
                };
            });
        }

        if (!scenes || scenes.length === 0) {
            throw new Error("No scenes found for compilation");
        }

        console.log(`[Compile] Starting compilation for docId ${docId} with ${scenes.length} scenes`);
        const sceneVideoPaths: string[] = [];

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
                    const shot = (scene.visualShots as any[])[sIdx];
                    const localShotPath = path.join(tempDir, `scene-${idx}-shot-${sIdx}.mp4`);
                    let downloaded = false;

                    if (shot.visualPath) {
                        try {
                            await downloadFileFromR2(shot.visualPath, localShotPath);
                            downloaded = true;
                        } catch {}
                    }

                    if (!downloaded && shot.id && docId) {
                        const altKey = `animated/projects/${docId}/scenes/${scene.id}/shots/shot_${shot.id}.mp4`;
                        try {
                            await downloadFileFromR2(altKey, localShotPath);
                            downloaded = true;
                        } catch {}
                    }

                    if (!downloaded) {
                        throw new Error(`Scene ${idx + 1} Shot ${sIdx + 1} video clip is missing from storage. Please click Generate Video for Scene ${idx + 1} Shot ${sIdx + 1} first.`);
                    }

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
                let downloaded = false;
                if (scene.visualPath) {
                    try {
                        await downloadFileFromR2(scene.visualPath, sceneVideoInputPath);
                        downloaded = true;
                    } catch {}
                }

                if (!downloaded) {
                    throw new Error(`Scene ${idx + 1} video clip is missing from storage. Please click Generate Video for Scene ${idx + 1} first.`);
                }
            }

            // B. Generate or Retrieve Audio for the Scene
            let duration = 5.0; // default fallback duration in seconds

            if (scene.narrationPath) {
                console.log(`[Compile] Downloading pre-generated voice: ${scene.narrationPath}`);
                await downloadFileFromR2(scene.narrationPath, sceneAudioPath);

                const ffprobeRes = execSync(
                    `ffprobe -i "${sceneAudioPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
                    { encoding: "utf8" }
                );
                duration = parseFloat(ffprobeRes.trim()) || 5.0;
            } else if (scene.type === "song" && scene.sunoAudioKey) {
                console.log(`[Compile] Downloading Suno audio: ${scene.sunoAudioKey}`);
                await downloadFileFromR2(scene.sunoAudioKey, sceneAudioPath);

                const ffprobeRes = execSync(
                    `ffprobe -i "${sceneAudioPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
                    { encoding: "utf8" }
                );
                duration = parseFloat(ffprobeRes.trim()) || 5.0;
            } else {
                throw new Error(`Scene ${idx + 1} is missing pre-generated narration audio. Please generate narration for Scene ${idx + 1} before compiling!`);
            }

            // C. Loop scene video to match exact audio duration
            console.log(`[Compile] Looping scene video to match ${duration}s audio duration`);
            execSync(
                `ffmpeg -stream_loop -1 -i "${sceneVideoInputPath}" -t ${duration} -c:v libx264 -preset fast -crf 22 "${sceneVideoLoopedPath}" -y`,
                { encoding: "utf8" }
            );

            // D. Combine Audio + Looped Video for this scene
            console.log(`[Compile] Muxing audio & video for scene ${idx + 1}`);
            execSync(
                `ffmpeg -i "${sceneVideoLoopedPath}" -i "${sceneAudioPath}" -c:v copy -c:a aac -b:a 128k -shortest "${sceneFinalVideoPath}" -y`,
                { encoding: "utf8" }
            );

            sceneVideoPaths.push(sceneFinalVideoPath);
        }

        // 2. Concatenate all final scene videos together
        console.log(`[Compile] Merging ${sceneVideoPaths.length} final scenes...`);
        const concatTxtPath = path.join(tempDir, "final-concat.txt");
        const concatFileContent = sceneVideoPaths.map(p => `file '${p.replace(/\\/g, "/")}'`).join("\n");
        fs.writeFileSync(concatTxtPath, concatFileContent);

        const mergedVideoPath = path.join(tempDir, "merged_final.mp4");
        execSync(
            `ffmpeg -f concat -safe 0 -i "${concatTxtPath}" -c:v libx264 -preset fast -crf 22 -c:a aac -b:a 128k "${mergedVideoPath}" -y`,
            { encoding: "utf8" }
        );

        // 3. Upload compiled video to R2 permanent project renders directory
        const sanitizedName = (customTitle || projectTitle || "Kids Movie").replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
        const finalR2Key = `animated/projects/${docId || Date.now()}/renders/${Date.now()}_${sanitizedName}.mp4`;
        console.log(`[Compile] Uploading final output to R2: ${finalR2Key}`);
        await uploadFileToR2(mergedVideoPath, finalR2Key, "video/mp4");

        // Clean up temporary workspace directory
        fs.rmSync(tempDir, { recursive: true, force: true });

        // Update target Documentary status
        if (docId) {
            await prisma.documentary.update({
                where: { id: docId },
                data: {
                    status: "APPROVED",
                    finalVideoPath: finalR2Key,
                    totalDuration: scenes.length * 5.0
                }
            });
        }

        return NextResponse.json({
            success: true,
            videoUrl: finalR2Key
        });

    } catch (err: any) {
        console.error("[Compile] Process failed:", err.message);
        return NextResponse.json({ error: "Compilation failed", details: err.message }, { status: 500 });
    }
}
