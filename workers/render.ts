/**
 * Render Worker — FFmpeg pipeline
 *
 * Processes rendered short videos:
 * 1. Downloads source video segment from R2
 * 2. Cuts segment (start → end)
 * 3. Burns karaoke-style ASS subtitles if available
 * 4. Adds hook text overlay at top (first 4 seconds)
 * 5. Adds CTA text overlay at bottom-right (last 3 seconds)
 * 6. Converts to 9:16 vertical if needed
 * 7. Mixes voiceover audio if enabled
 * 8. Uploads final short to R2
 *
 * Run: npx tsx workers/render.ts
 */
import { Worker, Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import IORedis from "ioredis";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { QUEUE_NAMES, RenderJobData } from "../lib/queue";
import { uploadFileToR2, downloadFileFromR2, generateShortR2Key } from "../lib/storage";
import { generateVoiceover } from "../lib/tts";
import { generateAssSubtitles, WordTimestamp, SubtitleStyle } from "../lib/ass-subtitles";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
});

const TEMP_DIR = path.join(os.tmpdir(), "yt-shorts-slicer", "render");
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

async function processRender(job: Job<RenderJobData>) {
    const {
        segmentId, userId, videoId,
        captionStyle, subtitleStyle, hookOverlay, ctaOverlay, ctaText,
        hookText: jobHookText, hookFontSize: jobHookFontSize, hookFont: jobHookFont,
        editedWords: jobEditedWords,
    } = job.data;

    try {
        console.log(`[Render] Starting: segment=${segmentId}`);
        await job.updateProgress(5);

        // Load segment + video + subtitle preset
        const segment = await prisma.segment.findUnique({
            where: { id: segmentId },
            include: {
                video: true,
                shortVideo: true,
            },
        });

        if (!segment) throw new Error(`Segment ${segmentId} not found`);
        if (!segment.video.storagePath) throw new Error("Video has no storage path");

        const renderDir = path.join(TEMP_DIR, segmentId);
        if (!fs.existsSync(renderDir)) fs.mkdirSync(renderDir, { recursive: true });

        await job.updateProgress(10);

        // Step 1: Download source video from R2
        const sourceVideo = path.join(renderDir, "source.mp4");
        console.log(`[Render] Downloading from R2: ${segment.video.storagePath}`);
        await downloadFileFromR2(segment.video.storagePath, sourceVideo);
        await job.updateProgress(20);

        // Step 2: Cut segment
        const cutVideo = path.join(renderDir, "cut.mp4");
        const duration = segment.endTime - segment.startTime;

        execSync(
            `ffmpeg -ss ${segment.startTime} -i "${sourceVideo}" -t ${duration} -c copy -avoid_negative_ts 1 "${cutVideo}" -y`,
            { timeout: 300000 }
        );
        await job.updateProgress(30);

        // Step 3: Build subtitle filter — ASS karaoke or fallback drawtext
        let assFilePath: string | null = null;
        const shouldBurnCaptions = captionStyle && captionStyle !== "none";

        if (shouldBurnCaptions) {
            try {
                // Get word-level timestamps: prefer editedWords, fall back to transcript
                let words: WordTimestamp[] = [];

                // Priority 1: editedWords from job data (user-corrected)
                if (jobEditedWords && Array.isArray(jobEditedWords) && jobEditedWords.length > 0) {
                    words = jobEditedWords;
                    console.log(`[Render] Using ${words.length} edited words from user`);
                }
                // Priority 2: editedWords from segment DB record
                else if ((segment as any).editedWords && Array.isArray((segment as any).editedWords) && ((segment as any).editedWords as any[]).length > 0) {
                    words = (segment as any).editedWords as WordTimestamp[];
                    console.log(`[Render] Using ${words.length} edited words from DB`);
                }
                // Priority 3: Transcript word-level timestamps
                else {
                    const transcript = await prisma.transcript.findUnique({
                        where: { videoId: segment.videoId },
                    });

                    if (transcript && transcript.segments) {
                        const segments = transcript.segments as any[];
                        // Extract all words from transcript segments that overlap with this clip
                        for (const seg of segments) {
                            if (seg.words && Array.isArray(seg.words)) {
                                for (const w of seg.words) {
                                    const wordStart = w.start ?? w.startTime;
                                    const wordEnd = w.end ?? w.endTime;
                                    const wordText = w.text || w.word || "";
                                    // Only include words within this segment's time range
                                    if (wordStart >= segment.startTime && wordEnd <= segment.endTime) {
                                        words.push({
                                            text: wordText.trim(),
                                            start: wordStart,
                                            end: wordEnd,
                                        });
                                    }
                                }
                            }
                        }
                        console.log(`[Render] Extracted ${words.length} words from transcript`);
                    }
                }

                if (words.length > 0) {
                    // Get subtitle preset for styling
                    const preset = subtitleStyle || await prisma.subtitlePreset.findFirst({
                        where: { userId },
                        orderBy: { createdAt: "desc" },
                    });

                    const style: Partial<SubtitleStyle> = {};
                    if (preset) {
                        style.font = preset.font || "Montserrat";
                        style.fontSize = preset.fontSize || 48;
                        style.primaryColor = preset.color || "#FFFFFF";
                        style.outlineColor = preset.outline || "#000000";
                        style.shadowColor = preset.shadow || "#00000080";
                        style.position = (preset.position as any) || "bottom";
                        style.animation = (captionStyle as any) || (preset.animation as any) || "word-highlight";
                        style.bold = true;
                    }
                    style.highlightColor = "#FFD700"; // Gold highlight — configurable later

                    // Generate ASS file
                    const assContent = generateAssSubtitles(words, style, segment.startTime);
                    assFilePath = path.join(renderDir, "subtitles.ass");
                    fs.writeFileSync(assFilePath, assContent, "utf8");
                    console.log(`[Render] Generated ASS subtitles: ${assFilePath}`);
                }
            } catch (assErr: any) {
                console.warn(`[Render] ASS subtitle generation failed, falling back: ${assErr.message}`);
            }
        }

        await job.updateProgress(40);

        // Step 4: Convert to 9:16 vertical with subtitles + overlays
        const outputPath = path.join(renderDir, "final.mp4");
        const filterChain: string[] = [
            "scale=1080:1920:force_original_aspect_ratio=decrease",
            "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
            "setsar=1",
        ];

        // Apply ASS subtitles if available
        if (assFilePath) {
            // Escape path for FFmpeg (backslashes and colons)
            const escapedAssPath = assFilePath
                .replace(/\\/g, "/")
                .replace(/:/g, "\\:");
            filterChain.push(`ass='${escapedAssPath}'`);
        }

        // Hook text overlay (top of video, first 4 seconds with fade)
        const resolvedHookText = jobHookText || (segment as any).hookText;
        if (hookOverlay && resolvedHookText) {
            const hookFontSize = jobHookFontSize || (segment as any).hookFontSize || 24;
            const hookFont = jobHookFont || (segment as any).hookFont || "Montserrat";
            const escapedHook = resolvedHookText
                .replace(/'/g, "'\\''")
                .replace(/:/g, "\\:")
                .replace(/\\/g, "\\\\");
            filterChain.push(
                `drawtext=text='${escapedHook}':fontsize=${hookFontSize}:font='${hookFont}':fontcolor=white:borderw=3:bordercolor=black:shadowcolor=black@0.5:shadowx=2:shadowy=2:x=(w-text_w)/2:y=100:enable='between(t,0.5,4)':alpha='if(lt(t,1),t-0.5,if(gt(t,3.5),4-t,1))'`
            );
        }

        // CTA text overlay (bottom-right, last 3 seconds)
        if (ctaOverlay && ctaText) {
            const escapedCta = ctaText
                .replace(/'/g, "'\\''")
                .replace(/:/g, "\\:")
                .replace(/\\/g, "\\\\");
            filterChain.push(
                `drawtext=text='${escapedCta}':fontsize=28:fontcolor=white:borderw=2:bordercolor=black:x=w-text_w-40:y=h-80:enable='gte(t,${Math.max(0, duration - 3)})'`
            );
        }

        execSync(
            `ffmpeg -i "${cutVideo}" -vf "${filterChain.join(",")}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart "${outputPath}" -y`,
            { timeout: 600000 }
        );
        await job.updateProgress(70);

        // Step 5: Mix voiceover if enabled
        if (segment.voiceoverEnabled && segment.voiceoverText) {
            try {
                console.log(`[Render] Generating voiceover for segment ${segmentId}`);
                const voiceId = segment.voiceoverVoice || "bm_george";
                // Determine TTS engine from voice ID pattern
                const engine = voiceId.startsWith("dia_") ? "dia" as const
                    : (voiceId.startsWith("bm_") || voiceId.startsWith("af_")) ? "xtts" as const
                    : "elevenlabs" as const;
                const audioBuffer = await generateVoiceover({
                    text: segment.voiceoverText,
                    voiceId,
                    engine,
                });

                const voiceoverPath = path.join(renderDir, "voiceover.wav");
                fs.writeFileSync(voiceoverPath, audioBuffer);

                const mixedOutput = path.join(renderDir, "mixed.mp4");
                execSync(
                    `ffmpeg -i "${outputPath}" -i "${voiceoverPath}" -filter_complex "[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac "${mixedOutput}" -y`,
                    { timeout: 300000 }
                );
                fs.renameSync(mixedOutput, outputPath);
                console.log(`[Render] Voiceover mixed successfully`);
            } catch (ttsErr: any) {
                console.warn(`[Render] Voiceover skipped: ${ttsErr.message}`);
            }
        }
        await job.updateProgress(85);

        // Step 6: Upload to R2
        const r2Key = generateShortR2Key(userId, videoId, segmentId);
        await uploadFileToR2(outputPath, r2Key, "video/mp4");
        await job.updateProgress(95);

        // Step 7: Create/update ShortVideo record
        await prisma.shortVideo.upsert({
            where: { segmentId },
            create: {
                segmentId,
                storagePath: r2Key,
                duration: Math.round(duration),
                status: "RENDERED",
            },
            update: {
                storagePath: r2Key,
                duration: Math.round(duration),
                status: "RENDERED",
                errorMsg: null,
            },
        });

        await prisma.segment.update({
            where: { id: segmentId },
            data: { status: "RENDERED" },
        });

        // Cleanup
        fs.rmSync(renderDir, { recursive: true, force: true });

        console.log(`[Render] Complete: ${segmentId} → ${r2Key}`);
        await job.updateProgress(100);

        return { segmentId, r2Key, duration };
    } catch (error: any) {
        console.error(`[Render] Failed: ${segmentId}`, error.message);
        throw error;
    }
}

// ─── Start Worker ────────────────────────────────
const worker = new Worker<RenderJobData>(
    QUEUE_NAMES.RENDER,
    processRender,
    {
        connection: redis as any,
        concurrency: 2,
        limiter: { max: 5, duration: 60000 },
    }
);

worker.on("completed", (job) => console.log(`[Worker] ✅ Render completed: ${job.id}`));
worker.on("failed", (job, err) => console.error(`[Worker] ❌ Render failed: ${job?.id}`, err.message));
console.log("🎬 Render worker started, waiting for jobs...");
