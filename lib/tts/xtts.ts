/**
 * XTTS v2 TTS Engine
 *
 * Self-hosted on RunPod. Voice cloning from 6-second sample.
 * Dispatches jobs via Redis queue to RunPod worker.
 */

import { addJob, waitForJobResult } from "@/lib/queue";

interface XttsGenerateOptions {
    text: string;
    speakerWav?: string; // R2 URL to voice clone sample
    language?: string;
    speed?: number;
}

interface XttsVoice {
    id: string;
    name: string;
    samplePath: string;
    description: string;
}

/**
 * Generate speech via XTTS v2 on RunPod.
 * Dispatches job to Redis → RunPod worker → Returns audio buffer.
 */
export async function generateSpeech(options: XttsGenerateOptions): Promise<Buffer> {
    const {
        text,
        speakerWav,
        language = "en",
        speed = 1.0,
    } = options;

    if (!speakerWav) {
        throw new Error("XTTS requires a speaker WAV sample for voice cloning");
    }

    // Dispatch to RunPod via Redis queue
    const jobId = await addJob("xtts_generate", {
        text,
        speaker_wav_url: speakerWav,
        language,
        speed,
    });

    // Wait for result (timeout: 120s for long narration)
    const result = await waitForJobResult(jobId, 120_000);

    if (!result || result.status === "FAILED") {
        throw new Error(`XTTS generation failed: ${result?.error || "timeout"}`);
    }

    // Result contains R2 URL to the generated audio
    if (result.output_url) {
        const response = await fetch(result.output_url);
        if (!response.ok) throw new Error("Failed to download XTTS audio from R2");
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    // Or direct audio buffer in base64
    if (result.audio_base64) {
        return Buffer.from(result.audio_base64, "base64");
    }

    throw new Error("XTTS result missing audio data");
}

/**
 * List custom XTTS voices (stored in database).
 * These are user-uploaded voice samples for cloning.
 */
export async function listVoices(): Promise<XttsVoice[]> {
    // For now, return empty — will be populated when users upload voice samples
    // In Phase 2, this will query the database for user's custom voices
    return [
        {
            id: "xtts_default_male",
            name: "Default Male",
            samplePath: "",
            description: "Built-in XTTS male voice (no cloning)",
        },
        {
            id: "xtts_default_female",
            name: "Default Female",
            samplePath: "",
            description: "Built-in XTTS female voice (no cloning)",
        },
    ];
}

/**
 * Estimate cost for XTTS generation.
 * Self-hosted on RunPod: ~$0.39/hr for A40, effectively free per request.
 */
export function estimateCost(_text: string): number {
    return 0; // Self-hosted, no per-request cost
}
