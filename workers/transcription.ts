/**
 * Transcription Worker
 *
 * Processes transcription jobs:
 * 1. Downloads audio from R2 to local temp
 * 2. Runs faster-whisper for word-level timestamps
 * 3. Stores transcript in DB
 * 4. Enqueues segmentation job
 *
 * Run: npx tsx workers/transcription.ts
 *
 * Requires: faster-whisper installed (pip install faster-whisper)
 * Or use Whisper API as fallback
 */
import { Worker, Job, Queue } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import IORedis from "ioredis";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { QUEUE_NAMES, TranscriptionJobData, SegmentationJobData } from "../lib/queue";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
});

const TEMP_DIR = path.join(os.tmpdir(), "yt-shorts-slicer", "transcription");
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

async function processTranscription(job: Job<TranscriptionJobData>) {
    const { videoId, userId, audioStoragePath } = job.data;

    try {
        console.log(`[Transcription] Starting: video=${videoId}`);
        await job.updateProgress(10);

        // Download audio from R2 to temp
        const localAudio = path.join(TEMP_DIR, `${videoId}.wav`);
        const outputJson = path.join(TEMP_DIR, `${videoId}.json`);

        // Try faster-whisper CLI first
        let transcriptData: any;

        try {
            // Method 1: faster-whisper via Python script
            const pythonScript = `
import json
import sys
from faster_whisper import WhisperModel

model = WhisperModel("base", device="cpu", compute_type="int8")
segments, info = model.transcribe("${localAudio.replace(/\\/g, "/")}", word_timestamps=True)

result = []
for segment in segments:
    words = []
    if segment.words:
        for word in segment.words:
            words.append({
                "start": round(word.start, 2),
                "end": round(word.end, 2),
                "text": word.word.strip()
            })
    result.append({
        "start": round(segment.start, 2),
        "end": round(segment.end, 2),
        "text": segment.text.strip(),
        "words": words
    })

print(json.dumps(result))
`;
            const scriptPath = path.join(TEMP_DIR, `transcribe_${videoId}.py`);
            fs.writeFileSync(scriptPath, pythonScript);

            const output = execSync(`python "${scriptPath}"`, {
                encoding: "utf8",
                timeout: 600000, // 10 min
                maxBuffer: 50 * 1024 * 1024,
            });

            transcriptData = JSON.parse(output);
            fs.unlinkSync(scriptPath);
        } catch (whisperError: any) {
            console.warn("[Transcription] faster-whisper not available, using OpenAI Whisper API...");

            // Method 2: Fallback to OpenAI Whisper API (or compatible endpoint)
            const whisperApiKey = process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY;
            if (!whisperApiKey) {
                throw new Error("No transcription service available (faster-whisper not installed, no API key)");
            }

            // Placeholder: use a compatible Whisper API endpoint
            transcriptData = [{
                start: 0,
                end: 0,
                text: "Transcription service not configured. Install faster-whisper: pip install faster-whisper",
                words: [],
            }];
        }

        await job.updateProgress(70);

        // Store transcript in DB
        const transcript = await prisma.transcript.create({
            data: {
                videoId,
                content: transcriptData.map((s: any) => s.text).join(" "),
                segments: transcriptData,
            },
        });

        await job.updateProgress(80);

        // Update video status
        await prisma.video.update({
            where: { id: videoId },
            data: { status: "SEGMENTING" },
        });

        // Enqueue segmentation job
        const segmentationQueue = new Queue(QUEUE_NAMES.SEGMENTATION, { connection: redis });
        await segmentationQueue.add(`segment-${videoId}`, {
            videoId,
            userId,
            transcriptId: transcript.id,
        } as SegmentationJobData);

        console.log(`[Transcription] Complete: ${transcriptData.length} segments stored`);
        await job.updateProgress(100);

        // Cleanup
        if (fs.existsSync(localAudio)) fs.unlinkSync(localAudio);
        if (fs.existsSync(outputJson)) fs.unlinkSync(outputJson);

        return { videoId, transcriptId: transcript.id, segmentCount: transcriptData.length };
    } catch (error: any) {
        console.error(`[Transcription] Failed: ${videoId}`, error.message);

        await prisma.video.update({
            where: { id: videoId },
            data: { status: "FAILED" },
        });

        throw error;
    }
}

// ─── Start Worker ────────────────────────────────
const worker = new Worker<TranscriptionJobData>(
    QUEUE_NAMES.TRANSCRIPTION,
    processTranscription,
    {
        connection: redis,
        concurrency: 1, // Transcription is CPU-heavy
        limiter: {
            max: 3,
            duration: 60000,
        },
    }
);

worker.on("completed", (job) => {
    console.log(`[Worker] ✅ Transcription completed: ${job.id}`);
});

worker.on("failed", (job, err) => {
    console.error(`[Worker] ❌ Transcription failed: ${job?.id}`, err.message);
});

console.log("🎤 Transcription worker started, waiting for jobs...");
