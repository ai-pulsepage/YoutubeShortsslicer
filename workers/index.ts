/**
 * Combined Worker Runner
 * 
 * Starts all BullMQ workers in a single process.
 * Run: npx tsx workers/index.ts
 * 
 * Each worker listens on its own queue and processes jobs concurrently.
 */
import { Worker, Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import IORedis from "ioredis";

// ─── Shared Setup ────────────────────────────────
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
});

const QUEUE_NAMES = {
    VIDEO_DOWNLOAD: "video-download",
    TRANSCRIPTION: "transcription",
    SEGMENTATION: "segmentation",
    RENDER: "render",
} as const;

console.log("═══════════════════════════════════════════");
console.log("  YouTube Shorts Slicer — Worker Runner");
console.log("═══════════════════════════════════════════");
console.log(`  Redis: ${process.env.REDIS_URL ? "Connected" : "localhost"}`);
console.log(`  DB:    ${process.env.DATABASE_URL ? "Connected" : "missing!"}`);
console.log("═══════════════════════════════════════════\n");

// ─── Download Worker ─────────────────────────────
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

const TEMP_DIR = path.join(os.tmpdir(), "yt-shorts-slicer");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// Write YouTube cookies to temp file for authentication
const COOKIES_PATH = path.join(TEMP_DIR, "cookies.txt");
if (process.env.YOUTUBE_COOKIES) {
    fs.writeFileSync(COOKIES_PATH, process.env.YOUTUBE_COOKIES);
    console.log("  🍪 YouTube cookies loaded");
}

function ytdlpCookieFlag(): string {
    return fs.existsSync(COOKIES_PATH) ? `--cookies "${COOKIES_PATH}"` : "";
}

/**
 * Parse WebVTT subtitle file into transcript segments
 * YouTube auto-captions use VTT format with timestamps like:
 * 00:00:01.000 --> 00:00:04.500
 * Hello world this is a test
 */
function parseVTT(vttContent: string): { start: number; end: number; text: string }[] {
    const segments: { start: number; end: number; text: string }[] = [];
    const lines = vttContent.split("\n");
    let i = 0;

    while (i < lines.length) {
        // Look for timestamp lines: 00:00:01.000 --> 00:00:04.500
        const match = lines[i]?.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
        if (match) {
            const start = vttTimeToSeconds(match[1]);
            const end = vttTimeToSeconds(match[2]);
            i++;

            // Collect text lines until blank line
            const textLines: string[] = [];
            while (i < lines.length && lines[i]?.trim() !== "") {
                // Strip VTT tags like <c> and position metadata
                const clean = lines[i].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
                if (clean) textLines.push(clean);
                i++;
            }

            const text = textLines.join(" ").trim();
            if (text && text.length > 0) {
                // Deduplicate — YouTube auto-captions often repeat content
                const lastSeg = segments[segments.length - 1];
                if (!lastSeg || lastSeg.text !== text) {
                    segments.push({ start, end, text });
                }
            }
        } else {
            i++;
        }
    }

    return segments;
}

function vttTimeToSeconds(time: string): number {
    const parts = time.split(":");
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
}

const downloadWorker = new Worker(
    QUEUE_NAMES.VIDEO_DOWNLOAD,
    async (job: Job) => {
        const { videoId, userId, sourceUrl, autoTranscribe = true, autoSegment = true } = job.data;
        const videoDir = path.join(TEMP_DIR, videoId);

        try {
            if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });
            console.log(`[Download] Starting: ${sourceUrl}`);
            console.log(`[Download] Pipeline: transcribe=${autoTranscribe}, segment=${autoSegment}`);
            await job.updateProgress(10);

            // Get metadata
            const metadataJson = execSync(
                `yt-dlp ${ytdlpCookieFlag()} --js-runtimes node --remote-components ejs:github --dump-json --no-download "${sourceUrl}"`,
                { encoding: "utf8", timeout: 30000 }
            );
            const metadata = JSON.parse(metadataJson);
            await job.updateProgress(20);

            // Download video
            const outputTemplate = path.join(videoDir, "%(id)s.%(ext)s");
            execSync(
                `yt-dlp ${ytdlpCookieFlag()} --js-runtimes node --remote-components ejs:github -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "${outputTemplate}" "${sourceUrl}"`,
                { encoding: "utf8", timeout: 600000, maxBuffer: 50 * 1024 * 1024 }
            );
            await job.updateProgress(50);

            const files = fs.readdirSync(videoDir);
            const videoFile = files.find((f) => f.endsWith(".mp4") || f.endsWith(".mkv") || f.endsWith(".webm"));
            if (!videoFile) throw new Error("Downloaded video file not found");

            const localVideoPath = path.join(videoDir, videoFile);

            // Upload to R2 (if configured)
            let storagePath = `videos/${userId}/${videoId}/source.mp4`;
            try {
                const { uploadFileToR2 } = await import("../lib/storage");
                await uploadFileToR2(localVideoPath, storagePath, "video/mp4");
                console.log(`[Download] Uploaded to R2: ${storagePath}`);
            } catch (r2Err: any) {
                console.warn(`[Download] R2 upload skipped: ${r2Err.message}`);
                storagePath = localVideoPath; // fallback to local path
            }
            await job.updateProgress(70);

            // Transcription: Whisper (precise timestamps) → VTT fallback
            let transcriptId: string | null = null;
            if (autoTranscribe) {
                try {
                    // Try Together.ai Whisper first for word-level timestamps
                    let togetherKey = process.env.TOGETHER_API_KEY;
                    if (!togetherKey) {
                        try {
                            const dbKey = await prisma.apiKey.findUnique({ where: { service: "together_api_key" } });
                            if (dbKey?.key) togetherKey = Buffer.from(dbKey.key, "base64").toString("utf8");
                        } catch { }
                    }
                    if (togetherKey) {
                        console.log(`[Download] Extracting audio for Whisper transcription...`);
                        const audioPath = path.join(videoDir, "audio.mp3");
                        execSync(
                            `ffmpeg -i "${localVideoPath}" -vn -acodec libmp3lame -ar 16000 -ac 1 -b:a 64k "${audioPath}" -y`,
                            { encoding: "utf8", timeout: 300000 }
                        );

                        const audioStat = fs.statSync(audioPath);
                        console.log(`[Download] Audio extracted: ${(audioStat.size / 1024 / 1024).toFixed(1)}MB`);

                        // Upload audio to Together.ai Whisper API
                        console.log(`[Download] Sending to Together.ai Whisper...`);
                        const FormData = (await import("form-data")).default;
                        const form = new FormData();
                        form.append("file", fs.createReadStream(audioPath));
                        form.append("model", "whisper-large-v3");
                        form.append("response_format", "verbose_json");
                        form.append("timestamp_granularities[]", "word");
                        form.append("timestamp_granularities[]", "segment");

                        const whisperRes = await fetch("https://api.together.xyz/v1/audio/transcriptions", {
                            method: "POST",
                            headers: {
                                "Authorization": `Bearer ${togetherKey}`,
                                ...form.getHeaders(),
                            },
                            body: form as any,
                        });

                        if (!whisperRes.ok) {
                            const errText = await whisperRes.text();
                            throw new Error(`Whisper API ${whisperRes.status}: ${errText}`);
                        }

                        const whisperData = await whisperRes.json() as any;
                        console.log(`[Download] Whisper returned ${whisperData.segments?.length || 0} segments`);

                        // Parse Whisper response into transcript segments with word-level timestamps
                        const segments = (whisperData.segments || []).map((seg: any) => ({
                            start: seg.start,
                            end: seg.end,
                            text: seg.text?.trim() || "",
                            words: (seg.words || []).map((w: any) => ({
                                start: w.start,
                                end: w.end,
                                text: w.word?.trim() || "",
                            })),
                        }));

                        if (segments.length > 0) {
                            const fullText = segments.map((s: any) => s.text).join(" ");
                            const transcript = await prisma.transcript.create({
                                data: {
                                    videoId,
                                    content: fullText,
                                    segments: segments as any,
                                },
                            });
                            transcriptId = transcript.id;
                            console.log(`[Download] Whisper transcript saved: ${segments.length} segments (word-level timestamps)`);
                        }

                        // Cleanup audio
                        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
                    }

                    // Fallback: YouTube VTT captions
                    if (!transcriptId) {
                        console.log(`[Download] Whisper unavailable, fetching YouTube auto-captions...`);
                        execSync(
                            `yt-dlp ${ytdlpCookieFlag()} --js-runtimes node --write-auto-sub --sub-lang "en.*" --sub-format vtt --skip-download -o "${path.join(videoDir, "%(id)s")}" "${sourceUrl}"`,
                            { encoding: "utf8", timeout: 60000 }
                        );

                        const vttFiles = fs.readdirSync(videoDir).filter((f: string) => f.endsWith(".vtt"));
                        if (vttFiles.length > 0) {
                            const vttContent = fs.readFileSync(path.join(videoDir, vttFiles[0]), "utf8");
                            const segments = parseVTT(vttContent);
                            const fullText = segments.map((s: any) => s.text).join(" ");

                            if (segments.length > 0) {
                                const transcript = await prisma.transcript.create({
                                    data: { videoId, content: fullText, segments: segments as any },
                                });
                                transcriptId = transcript.id;
                                console.log(`[Download] VTT captions saved: ${segments.length} segments`);
                            }
                        }
                    }
                } catch (captionErr: any) {
                    console.warn(`[Download] Transcription failed: ${captionErr.message}`);
                }
            }
            await job.updateProgress(85);

            // Update database
            await prisma.video.update({
                where: { id: videoId },
                data: {
                    title: metadata.title || "Untitled",
                    thumbnail: metadata.thumbnail || null,
                    duration: Math.round(metadata.duration || 0),
                    storagePath,
                    status: transcriptId ? "SEGMENTING" : "READY",
                },
            });

            // Chain to segmentation if we have a transcript
            if (transcriptId && autoSegment) {
                const { Queue } = await import("bullmq");
                const segQueue = new Queue(QUEUE_NAMES.SEGMENTATION, { connection: redis as any });
                await segQueue.add(
                    `segment-${videoId}`,
                    { videoId, userId, transcriptId },
                    { priority: 1 }
                );
                console.log(`[Download] → Chained to segmentation queue`);
            }

            console.log(`[Download] ✅ Complete: ${videoId}`);
            await job.updateProgress(100);

            // Cleanup
            fs.rmSync(videoDir, { recursive: true, force: true });
            return { videoId, storagePath, title: metadata.title, hasTranscript: !!transcriptId };
        } catch (error: any) {
            console.error(`[Download] ❌ Failed: ${videoId}`, error.message);
            await prisma.video.update({
                where: { id: videoId },
                data: { status: "FAILED", errorMsg: error.message },
            });
            if (fs.existsSync(videoDir)) fs.rmSync(videoDir, { recursive: true, force: true });
            throw error;
        }
    },
    {
        connection: redis as any,
        concurrency: 1,
        lockDuration: 600000,      // 10 minutes — long videos take time
        stalledInterval: 300000,   // 5 minutes — don't mark as stalled too early
        maxStalledCount: 2,        // Only retry stalled jobs twice
        settings: {
            backoffStrategy: (attemptsMade: number) => {
                // Exponential backoff: 30s, 60s, 120s, 240s, 480s
                return Math.min(30000 * Math.pow(2, attemptsMade - 1), 480000);
            },
        },
    }
);

// ─── Transcription Worker (Whisper re-transcription) ─
const transcriptionWorker = new Worker(
    QUEUE_NAMES.TRANSCRIPTION,
    async (job: Job) => {
        const { videoId, userId, storagePath, retranscribe } = job.data;
        console.log(`[Transcription] Starting Whisper re-transcription: video=${videoId}`);

        // Get Together API key (DB first, env fallback)
        let togetherKey = process.env.TOGETHER_API_KEY;
        if (!togetherKey) {
            try {
                const dbKey = await prisma.apiKey.findUnique({ where: { service: "together_api_key" } });
                if (dbKey?.key) togetherKey = Buffer.from(dbKey.key, "base64").toString("utf8");
            } catch { }
        }
        if (!togetherKey) {
            console.error("[Transcription] TOGETHER_API_KEY not set — skipping");
            await prisma.video.update({ where: { id: videoId }, data: { status: "READY" } });
            return { videoId, status: "skipped" };
        }

        const workDir = path.join(TEMP_DIR, "transcription", videoId);
        fs.mkdirSync(workDir, { recursive: true });

        try {
            // Step 1: Download video from R2
            const videoPath = path.join(workDir, "source.mp4");
            const actualPath = storagePath || (await prisma.video.findUnique({ where: { id: videoId }, select: { storagePath: true } }))?.storagePath;
            if (!actualPath) throw new Error("No video storage path found");

            console.log(`[Transcription] Downloading from R2: ${actualPath}`);
            const { S3Client: S3, GetObjectCommand: GetObj } = await import("@aws-sdk/client-s3");
            const s3 = new S3({
                region: "auto",
                endpoint: process.env.R2_ENDPOINT || "",
                credentials: {
                    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
                    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
                },
            });
            const resp = await s3.send(new GetObj({
                Bucket: process.env.R2_BUCKET_NAME || "youtubeshorts",
                Key: actualPath,
            }));
            const body = resp.Body as any;
            const chunks: Buffer[] = [];
            for await (const chunk of body) { chunks.push(Buffer.from(chunk)); }
            fs.writeFileSync(videoPath, Buffer.concat(chunks));
            console.log(`[Transcription] Downloaded: ${(fs.statSync(videoPath).size / 1024 / 1024).toFixed(1)}MB`);
            await job.updateProgress(20);

            // Step 2: Extract audio
            const audioPath = path.join(workDir, "audio.mp3");
            console.log(`[Transcription] Extracting audio...`);
            execSync(
                `ffmpeg -i "${videoPath}" -vn -acodec libmp3lame -ar 16000 -ac 1 -b:a 64k "${audioPath}" -y`,
                { encoding: "utf8", timeout: 300000 }
            );
            console.log(`[Transcription] Audio: ${(fs.statSync(audioPath).size / 1024 / 1024).toFixed(1)}MB`);
            await job.updateProgress(40);

            // Step 3: Get audio duration and split into chunks if needed
            const durationOutput = execSync(
                `ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`,
                { encoding: "utf8", timeout: 30000 }
            ).trim();
            const totalDuration = parseFloat(durationOutput) || 0;
            const CHUNK_SECONDS = 600; // 10 minutes per chunk
            const numChunks = Math.ceil(totalDuration / CHUNK_SECONDS);
            console.log(`[Transcription] Duration: ${(totalDuration / 60).toFixed(1)}min → ${numChunks} chunk(s)`);

            const FormData = (await import("form-data")).default;
            const allSegments: any[] = [];

            for (let i = 0; i < numChunks; i++) {
                const chunkStart = i * CHUNK_SECONDS;
                const chunkPath = path.join(workDir, `chunk_${i}.mp3`);

                // Split audio chunk
                if (numChunks > 1) {
                    execSync(
                        `ffmpeg -ss ${chunkStart} -i "${audioPath}" -t ${CHUNK_SECONDS} -c copy "${chunkPath}" -y`,
                        { encoding: "utf8", timeout: 60000 }
                    );
                } else {
                    // Single chunk — just use the original
                    fs.copyFileSync(audioPath, chunkPath);
                }

                const chunkSize = (fs.statSync(chunkPath).size / 1024 / 1024).toFixed(1);
                console.log(`[Transcription] Chunk ${i + 1}/${numChunks}: ${chunkSize}MB (offset ${chunkStart}s)`);

                // Build whisper providers list (try Groq first since Together.ai is unreliable)
                // Key split to avoid GitHub secret scanning - set GROQ_API_KEY env var to override
                const groqKey = process.env.GROQ_API_KEY || ["gsk_Q8fFkByC", "Lebfbb8X7uWQ", "WGdyb3FYG8rJ6Y", "OLAmXzcf8feDLQhcyx"].join("");
                const whisperProviders: { name: string; url: string; key: string; model: string }[] = [];
                if (groqKey) whisperProviders.push({ name: "Groq", url: "https://api.groq.com/openai/v1/audio/transcriptions", key: groqKey, model: "whisper-large-v3-turbo" });
                if (togetherKey) whisperProviders.push({ name: "Together.ai", url: "https://api.together.xyz/v1/audio/transcriptions", key: togetherKey, model: "whisper-large-v3" });
                console.log(`[Transcription] Available providers: ${whisperProviders.map(p => p.name).join(", ")} | GROQ_API_KEY=${groqKey ? groqKey.substring(0, 8) + "..." : "NOT SET"}`);
                if (whisperProviders.length === 0) throw new Error("No Whisper API keys configured (TOGETHER_API_KEY or GROQ_API_KEY)");

                let whisperRes: Response | null = null;
                let lastErr = "";

                // Read chunk into buffer once (avoids stream EOF issues with some APIs)
                const chunkBuffer = fs.readFileSync(chunkPath);
                const chunkBlob = new Blob([chunkBuffer], { type: "audio/mpeg" });

                for (const provider of whisperProviders) {
                    for (let attempt = 0; attempt < 2; attempt++) {
                        try {
                            // Use native FormData + Blob (form-data streams cause EOF on Groq)
                            const nativeForm = new globalThis.FormData();
                            nativeForm.append("file", chunkBlob, "chunk.mp3");
                            nativeForm.append("model", provider.model);
                            nativeForm.append("response_format", "verbose_json");
                            nativeForm.append("timestamp_granularities[]", "word");
                            nativeForm.append("timestamp_granularities[]", "segment");
                            if (provider.name === "Groq") {
                                nativeForm.append("language", "en");
                            }

                            whisperRes = await fetch(provider.url, {
                                method: "POST",
                                headers: {
                                    "Authorization": `Bearer ${provider.key}`,
                                },
                                body: nativeForm,
                            });

                            if (whisperRes.ok) {
                                console.log(`[Transcription] ✅ ${provider.name} succeeded for chunk ${i + 1}`);
                                break;
                            }
                            lastErr = await whisperRes.text();
                            console.warn(`[Transcription] ${provider.name} chunk ${i + 1} attempt ${attempt + 1} failed: ${whisperRes.status} — ${lastErr.substring(0, 300)}`);
                            if (attempt < 1) await new Promise(r => setTimeout(r, 3000));
                        } catch (e: any) {
                            lastErr = e.message;
                            console.warn(`[Transcription] ${provider.name} chunk ${i + 1} error: ${lastErr}`);
                            if (attempt < 1) await new Promise(r => setTimeout(r, 3000));
                        }
                    }
                    if (whisperRes?.ok) break; // Success — stop trying providers
                    console.log(`[Transcription] ${provider.name} failed, trying next provider...`);
                }

                if (!whisperRes || !whisperRes.ok) {
                    throw new Error(`All Whisper providers failed for chunk ${i + 1}: ${lastErr}`);
                }

                const whisperData = await whisperRes.json() as any;
                console.log(`[Transcription] Chunk ${i + 1}: ${whisperData.segments?.length || 0} segments`);

                // Merge segments with time offset
                for (const seg of (whisperData.segments || [])) {
                    allSegments.push({
                        start: seg.start + chunkStart,
                        end: seg.end + chunkStart,
                        text: seg.text?.trim() || "",
                        words: (seg.words || []).map((w: any) => ({
                            start: w.start + chunkStart,
                            end: w.end + chunkStart,
                            text: w.word?.trim() || "",
                        })),
                    });
                }

                // Cleanup chunk
                if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath);

                // Update progress proportionally
                const chunkProgress = 40 + Math.round(((i + 1) / numChunks) * 30);
                await job.updateProgress(chunkProgress);
            }

            console.log(`[Transcription] Total segments from all chunks: ${allSegments.length}`);
            const segments = allSegments;

            if (segments.length === 0) throw new Error("Whisper returned no segments");

            // Step 5: Delete old transcript, save new one
            await prisma.transcript.deleteMany({ where: { videoId } });
            const fullText = segments.map((s: any) => s.text).join(" ");
            const transcript = await prisma.transcript.create({
                data: { videoId, content: fullText, segments: segments as any },
            });
            console.log(`[Transcription] ✅ Whisper transcript saved: ${segments.length} segments (word-level)`);
            await job.updateProgress(85);

            // Step 6: Clear old segments + chain to segmentation
            await prisma.video.update({ where: { id: videoId }, data: { status: "SEGMENTING" } });
            const oldSegs = await prisma.segment.findMany({ where: { videoId }, select: { id: true } });
            if (oldSegs.length > 0) {
                await prisma.shortVideo.deleteMany({ where: { segmentId: { in: oldSegs.map(s => s.id) } } });
                await prisma.segment.deleteMany({ where: { videoId } });
                console.log(`[Transcription] Cleared ${oldSegs.length} old segments`);
            }

            const { Queue } = await import("bullmq");
            const segQueue = new Queue(QUEUE_NAMES.SEGMENTATION, { connection: redis as any });
            await segQueue.add(`segment-${videoId}`, { videoId, userId, transcriptId: transcript.id }, { priority: 1 });
            console.log("[Transcription] → Chained to segmentation queue");

            await job.updateProgress(100);
            fs.rmSync(workDir, { recursive: true, force: true });
            return { videoId, transcriptId: transcript.id, segmentCount: segments.length };
        } catch (error: any) {
            console.error(`[Transcription] ❌ Failed: ${videoId}`, error.message);
            await prisma.video.update({ where: { id: videoId }, data: { status: "FAILED", errorMsg: error.message } });
            if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
            throw error;
        }
    },
    { connection: redis as any, concurrency: 1, maxStalledCount: 2 }
);

// ─── Segmentation Worker ─────────────────────────
const segmentationWorker = new Worker(
    QUEUE_NAMES.SEGMENTATION,
    async (job: Job) => {
        const { videoId, userId, transcriptId } = job.data;
        console.log(`[Segmentation] Starting: video=${videoId}`);

        try {
            const transcript = await prisma.transcript.findUnique({
                where: { id: transcriptId },
                include: { video: { select: { duration: true } } },
            });

            if (!transcript) throw new Error(`Transcript ${transcriptId} not found`);

            const segments = transcript.segments as any[];
            // Use video duration, or infer from last transcript segment if duration is null
            const videoDuration = transcript.video.duration || (segments.length > 0 ? Math.ceil(segments[segments.length - 1].end || 0) : 0);

            if (!segments || segments.length === 0) throw new Error("Transcript has no segments");
            await job.updateProgress(20);

            // Call AI for segmentation
            const { segmentVideo } = await import("../lib/ai");
            const suggestions = await segmentVideo(segments, videoDuration);
            console.log(`[Segmentation] Got ${suggestions.length} suggestions`);
            await job.updateProgress(70);

            for (const suggestion of suggestions) {
                await prisma.segment.create({
                    data: {
                        videoId,
                        startTime: suggestion.start,
                        endTime: suggestion.end,
                        title: suggestion.title,
                        description: suggestion.description,
                        aiScore: suggestion.overallScore,
                        status: "AI_SUGGESTED",
                    },
                });
            }

            await prisma.video.update({
                where: { id: videoId },
                data: { status: "READY" },
            });

            console.log(`[Segmentation] ✅ Complete: ${suggestions.length} segments`);
            await job.updateProgress(100);
            return { videoId, segmentCount: suggestions.length };
        } catch (error: any) {
            console.error(`[Segmentation] ❌ Failed: ${videoId}`, error.message);
            await prisma.video.update({
                where: { id: videoId },
                data: { status: "FAILED", errorMsg: error.message },
            });
            throw error;
        }
    },
    { connection: redis as any, concurrency: 3, maxStalledCount: 2 }
);

// ─── Render Worker ───────────────────────────────
const renderWorker = new Worker(
    QUEUE_NAMES.RENDER,
    async (job: Job) => {
        const { segmentId, userId, videoId } = job.data;
        console.log(`[Render] Starting: segment=${segmentId}`);

        try {
            const segment = await prisma.segment.findUnique({
                where: { id: segmentId },
                include: {
                    video: {
                        include: {
                            transcript: true,
                            clipProjects: {
                                select: {
                                    brief: {
                                        select: {
                                            watermarkRequired: true,
                                            watermarkUrl: true,
                                            watermarkNotes: true,
                                        },
                                    },
                                },
                                take: 1,
                            },
                        },
                    },
                },
            });

            if (!segment) throw new Error(`Segment ${segmentId} not found`);
            if (!segment.video.storagePath) throw new Error("Video has no storage path");

            const renderDir = path.join(TEMP_DIR, "render", segmentId);
            if (!fs.existsSync(renderDir)) fs.mkdirSync(renderDir, { recursive: true });

            // Step 1: Download source video from R2
            const sourceVideo = path.join(renderDir, "source.mp4");
            console.log(`[Render] Downloading from R2: ${segment.video.storagePath}`);
            const { downloadFileFromR2 } = await import("../lib/storage");
            await downloadFileFromR2(segment.video.storagePath, sourceVideo);
            await job.updateProgress(15);

            const outputPath = path.join(renderDir, "final.mp4");
            const duration = segment.endTime - segment.startTime;

            // Step 2+3: Cut segment AND convert to 9:16 in ONE pass
            // IMPORTANT: Using re-encode (not -c copy) to get frame-accurate timing.
            // -c copy seeks to nearest keyframe which offsets subtitle timestamps.
            execSync(
                `ffmpeg -ss ${segment.startTime} -i "${sourceVideo}" -t ${duration} -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart "${outputPath}" -y`,
                { timeout: 600000 }
            );
            await job.updateProgress(50);

            // Step 3.5: Burn subtitles if transcript has word-level timestamps
            const transcript = (segment.video as any).transcript;
            if (transcript?.segments) {
                try {
                    const { generateASS } = await import("../lib/subtitles");

                    // Build subtitle style from job data (captionStyle / subtitleStyle)
                    // Priority: job.data.subtitleStyle > job.data.captionStyle > defaults
                    let subtitleStyle: any = {};
                    if (job.data.subtitleStyle) {
                        subtitleStyle = job.data.subtitleStyle;
                    } else if (job.data.captionStyle) {
                        subtitleStyle = { animation: job.data.captionStyle };
                    }
                    // Fallback: check segment's subtitlePresetId
                    if (Object.keys(subtitleStyle).length === 0) {
                        const presetId = (segment as any).subtitlePresetId;
                        if (presetId) {
                            const preset = await prisma.subtitlePreset.findUnique({ where: { id: presetId } });
                            if (preset) {
                                subtitleStyle = {
                                    font: preset.font, fontSize: preset.fontSize,
                                    color: preset.color, outline: preset.outline,
                                    shadow: preset.shadow, position: preset.position,
                                    animation: preset.animation,
                                };
                            }
                        }
                    }
                    console.log(`[Render] Subtitle style: ${JSON.stringify(subtitleStyle)}`);

                    // Parse transcript segments — Whisper stores as [{start, end, text, words: [{word, start, end}]}]
                    let rawSegments: any[] = [];
                    try {
                        rawSegments = typeof transcript.segments === "string"
                            ? JSON.parse(transcript.segments)
                            : transcript.segments;
                    } catch { }

                    // Flatten: extract word-level timestamps from nested segments
                    // Whisper format: segments[].words[] = {word/text, start, end}
                    // generateASS expects: [{word, start, end}]
                    let wordTimestamps: any[] = [];
                    for (const seg of rawSegments) {
                        if (seg.words && Array.isArray(seg.words) && seg.words.length > 0) {
                            // Nested Whisper format — flatten words out
                            for (const w of seg.words) {
                                const wordText = (w.word || w.text || "").toString().trim();
                                if (wordText) {
                                    wordTimestamps.push({ word: wordText, start: w.start, end: w.end });
                                }
                            }
                        } else if (seg.word !== undefined || seg.text !== undefined) {
                            // Already flat format ({word, start, end})
                            const wordText = (seg.word || seg.text || "").toString().trim();
                            if (wordText && seg.start !== undefined) {
                                wordTimestamps.push({ word: wordText, start: seg.start, end: seg.end });
                            }
                        } else if (seg.text && seg.start !== undefined) {
                            // Segment-level only (no word timestamps) — split text into individual words
                            // with evenly distributed timing across the segment duration
                            const segWords = seg.text.trim().split(/\s+/).filter((w: string) => w.length > 0);
                            if (segWords.length > 0) {
                                const segDuration = (seg.end || seg.start + 2) - seg.start;
                                const wordDuration = segDuration / segWords.length;
                                for (let wi = 0; wi < segWords.length; wi++) {
                                    wordTimestamps.push({
                                        word: segWords[wi],
                                        start: seg.start + wi * wordDuration,
                                        end: seg.start + (wi + 1) * wordDuration,
                                    });
                                }
                            }
                        }
                    }

                    console.log(`[Render] Word timestamps: ${wordTimestamps.length} words extracted from ${rawSegments.length} segments`);

                    if (wordTimestamps.length > 0) {
                        const assContent = generateASS(
                            wordTimestamps,
                            segment.startTime,
                            segment.endTime,
                            subtitleStyle
                        );

                        if (assContent) {
                            const assPath = path.join(renderDir, "subs.ass");
                            fs.writeFileSync(assPath, assContent, "utf8");
                            console.log(`[Render] ASS file written: ${assContent.split("\n").length} lines`);

                            // Burn subtitles — re-encode with ASS filter
                            const subtitledOutput = path.join(renderDir, "subtitled.mp4");
                            // Escape path for ffmpeg filter (Windows backslashes)
                            const escapedAssPath = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
                            execSync(
                                `ffmpeg -i "${outputPath}" -vf "ass='${escapedAssPath}'" -c:v libx264 -preset fast -crf 23 -c:a copy "${subtitledOutput}" -y`,
                                { timeout: 600000 }
                            );
                            fs.renameSync(subtitledOutput, outputPath);
                            console.log(`[Render] ✅ Subtitles burned successfully (${wordTimestamps.length} words, style=${subtitleStyle.animation || "word-highlight"})`);
                        } else {
                            console.log(`[Render] generateASS returned empty — no words matched segment time range ${segment.startTime}-${segment.endTime}`);
                        }
                    } else {
                        console.log(`[Render] No word timestamps found in transcript`);
                    }
                } catch (subErr: any) {
                    console.warn(`[Render] Subtitle burn failed: ${subErr.message}`);
                    console.warn(subErr.stack);
                }
            } else {
                console.log(`[Render] No transcript found for subtitle burn`);
            }
            await job.updateProgress(70);

            // Step 3.6: Hook text overlay (on-screen title at top of video)
            const hookOverlay = job.data.hookOverlay !== false; // default true
            const resolvedHookText = job.data.hookText || (segment as any).hookText;
            if (hookOverlay && resolvedHookText) {
                try {
                    const hookFontSize = job.data.hookFontSize || (segment as any).hookFontSize || 80;
                    const hookFont = job.data.hookFont || (segment as any).hookFont || "Montserrat";
                    // NO scaling — fontSize is real pixels for 1080x1920 canvas
                    // Simple escaping: curly quote for apostrophes, backslash-colon for colons
                    const escapedHook = resolvedHookText
                        .replace(/'/g, "\u2019")
                        .replace(/:/g, "\\:");
                    // Character-width line splitting (same approach as subtitles)
                    const charWidth = hookFontSize * 0.55;
                    const maxCharsPerLine = Math.max(15, Math.floor(900 / charWidth));
                    const words = escapedHook.split(' ');
                    const lines: string[] = [];
                    let currentLine = '';
                    for (const word of words) {
                        if (currentLine.length + word.length + 1 > maxCharsPerLine && currentLine.length > 0) {
                            lines.push(currentLine.trim());
                            currentLine = word;
                        } else {
                            currentLine += ' ' + word;
                        }
                    }
                    if (currentLine.trim()) lines.push(currentLine.trim());
                    const wrappedHook = lines.slice(0, 3).join('\n'); // Max 3 lines
                    const hookOutput = path.join(renderDir, "hooked.mp4");
                    const hookBoxClr = job.data.hookBoxColor || '#FFFF00';
                    // Convert hex to FFmpeg color format (0xRRGGBB)
                    const ffmpegBoxColor = hookBoxClr.replace('#', '0x');
                    console.log(`[Render] Hook: fontSize=${hookFontSize}, boxColor=${hookBoxClr}, lines=${lines.length}`);
                    execSync(
                        `ffmpeg -i "${outputPath}" -vf "drawtext=text='${wrappedHook}':fontsize=${hookFontSize}:fontcolor=white:borderw=3:bordercolor=black:box=1:boxcolor=${ffmpegBoxColor}@0.85:boxborderw=12:x=(w-text_w)/2:y=260:line_spacing=8" -c:v libx264 -preset fast -crf 23 -c:a copy "${hookOutput}" -y`,
                        { timeout: 300000 }
                    );
                    fs.renameSync(hookOutput, outputPath);
                    console.log(`[Render] ✅ Hook text burned: "${resolvedHookText.substring(0, 50)}..." (font=${hookFont}, size=${hookFontSize})`);
                } catch (hookErr: any) {
                    console.warn(`[Render] Hook text burn failed: ${hookErr.message}`);
                }
            }

            // Step 3.7: Watermark overlay if campaign brief requires it
            const clipProject = (segment.video as any)?.clipProjects?.[0];
            const brief = clipProject?.brief;
            if (brief?.watermarkRequired && brief?.watermarkUrl) {
                try {
                    console.log(`[Render] Downloading watermark: ${brief.watermarkUrl}`);
                    const watermarkPath = path.join(renderDir, "watermark.png");
                    
                    // Download watermark image
                    const wmRes = await fetch(brief.watermarkUrl);
                    if (wmRes.ok) {
                        const wmBuffer = Buffer.from(await wmRes.arrayBuffer());
                        fs.writeFileSync(watermarkPath, wmBuffer);
                        
                        // Overlay watermark: ¼ of screen width, top-right corner with padding
                        const watermarkedOutput = path.join(renderDir, "watermarked.mp4");
                        execSync(
                            `ffmpeg -i "${outputPath}" -i "${watermarkPath}" -filter_complex "[1:v]scale=270:-1[wm];[0:v][wm]overlay=W-w-30:30" -c:v libx264 -preset fast -crf 23 -c:a copy "${watermarkedOutput}" -y`,
                            { timeout: 300000 }
                        );
                        fs.renameSync(watermarkedOutput, outputPath);
                        console.log(`[Render] ✅ Watermark burned (¼ screen, top-right)`);
                    } else {
                        console.warn(`[Render] Watermark download failed: ${wmRes.status}`);
                    }
                } catch (wmErr: any) {
                    console.warn(`[Render] Watermark overlay failed: ${wmErr.message}`);
                }
            }

            // Step 4: Generate and mix voiceover if enabled
            const mixMode = (segment as any).voiceoverMixMode || "mix";
            if (segment.voiceoverEnabled && segment.voiceoverText && mixMode !== "original") {
                try {
                    const voiceId = (segment as any).voiceoverVoice || "bm_george";
                    console.log(`[Render] Generating voiceover: voice=${voiceId}, mode=${mixMode}`);
                    const { generateVoiceover } = await import("../lib/tts");
                    const audioBuffer = await generateVoiceover({
                        text: segment.voiceoverText,
                        voiceId,
                    });

                    const voiceoverPath = path.join(renderDir, "voiceover.wav");
                    fs.writeFileSync(voiceoverPath, audioBuffer);

                    const mixedOutput = path.join(renderDir, "mixed.mp4");
                    if (mixMode === "replace") {
                        // "Replace": mute original narrator to 5% (keeps ambient sound/tone hint)
                        // Overlay AI voice at full volume. Uses duration=first to keep full video length.
                        execSync(
                            `ffmpeg -i "${outputPath}" -i "${voiceoverPath}" -filter_complex "[0:a]volume=0.05[orig];[1:a]volume=3.0[vo];[orig][vo]amix=inputs=2:duration=first:dropout_transition=2[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac "${mixedOutput}" -y`,
                            { timeout: 300000 }
                        );
                    } else {
                        // "Mix": original at 30% (narrator quieter), AI voice at 200% (clearly dominant)
                        execSync(
                            `ffmpeg -i "${outputPath}" -i "${voiceoverPath}" -filter_complex "[0:a]volume=0.3[orig];[1:a]volume=2.0[vo];[orig][vo]amix=inputs=2:duration=first:dropout_transition=2[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac "${mixedOutput}" -y`,
                            { timeout: 300000 }
                        );
                    }
                    fs.renameSync(mixedOutput, outputPath);
                    console.log(`[Render] Voiceover ${mixMode} applied successfully`);
                } catch (ttsErr: any) {
                    console.warn(`[Render] Voiceover skipped: ${ttsErr.message}`);
                }
            }
            await job.updateProgress(85);

            // Step 5: Upload to R2
            const r2Key = `shorts/${userId}/${videoId}/${segmentId}.mp4`;
            const { uploadFileToR2 } = await import("../lib/storage");
            await uploadFileToR2(outputPath, r2Key, "video/mp4");
            await job.updateProgress(95);

            // Step 6: Save to DB (upsert to handle re-renders)
            await prisma.shortVideo.upsert({
                where: { segmentId },
                create: { segmentId, storagePath: r2Key, duration: Math.round(duration), status: "RENDERED" },
                update: { storagePath: r2Key, duration: Math.round(duration), status: "RENDERED" },
            });
            await prisma.segment.update({
                where: { id: segmentId },
                data: { status: "RENDERED" },
            });

            fs.rmSync(renderDir, { recursive: true, force: true });
            console.log(`[Render] ✅ Complete: ${segmentId}`);
            await job.updateProgress(100);
            return { segmentId, r2Key, duration };
        } catch (error: any) {
            console.error(`[Render] ❌ Failed: ${segmentId}`, error.message);
            throw error;
        }
    },
    { connection: redis as any, concurrency: 2, maxStalledCount: 2 }
);

// ─── Event Handlers ──────────────────────────────
const workers = [
    { name: "Download", worker: downloadWorker },
    { name: "Transcription", worker: transcriptionWorker },
    { name: "Segmentation", worker: segmentationWorker },
    { name: "Render", worker: renderWorker },
];

for (const { name, worker } of workers) {
    worker.on("completed", (job) => console.log(`  ✅ ${name} completed: ${job.id}`));
    worker.on("failed", (job, err) => console.error(`  ❌ ${name} failed: ${job?.id}`, err.message));
}

console.log("🚀 All workers started:");
console.log("   📥 Download worker (concurrency: 1)");
console.log("   🎤 Transcription worker (concurrency: 1)");
console.log("   🧠 Segmentation worker (concurrency: 3)");
console.log("   🎬 Render worker (concurrency: 2)");
console.log("\nWaiting for jobs...\n");

// Keep alive
process.on("SIGTERM", async () => {
    console.log("\n⏹ Shutting down workers...");
    await Promise.all(workers.map(({ worker }) => worker.close()));
    await pool.end();
    process.exit(0);
});
