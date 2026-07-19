/**
 * TTS Engine Router
 *
 * Routes voiceover generation to the correct engine:
 *   - ElevenLabs (premium, API-based)
 *   - XTTS v2 (self-hosted on RunPod, voice cloning)
 *
 * Applies narrator style markup (pauses, pacing) before generation.
 */

import {
    NarratorStyle,
    getStyleConfig,
    applyStyleForElevenLabs,
    splitForXtts,
} from "./tts/narrator-style";
import {
    generateSpeech as elevenLabsGenerate,
    listVoices as elevenLabsListVoices,
} from "./tts/elevenlabs";
import {
    generateSpeech as xttsGenerate,
    listVoices as xttsListVoices,
} from "./tts/xtts";
import {
    generateSpeech as diaGenerate,
    listVoices as diaListVoices,
    healthCheck as diaHealthCheck,
} from "./tts/dia";
import {
    generateSpeech as geminiGenerate,
    listVoices as geminiListVoices,
    healthCheck as geminiHealthCheck,
    GEMINI_VOICES,
} from "./tts/gemini";

export type TtsEngine = "elevenlabs" | "xtts" | "dia" | "gemini" | "edge_tts";
export { GEMINI_VOICES };
export type { NarratorStyle } from "./tts/narrator-style";

export interface VoiceoverOptions {
    text: string;
    engine: TtsEngine;
    voiceId: string;
    speed?: number;
    narratorStyle?: NarratorStyle;
    speakerWav?: string; // XTTS voice clone sample (R2 URL)
    diaVoiceRef?: string; // Dia predefined voice filename or clone reference
    diaVoiceMode?: "single_s1" | "single_s2" | "dialogue" | "clone" | "predefined";
    diaTranscript?: string; // Pre-computed transcript of reference audio (skips Whisper)
    diaSeed?: number; // Fixed seed for Dia voice consistency
}

export interface VoiceInfo {
    id: string;
    name: string;
    description: string;
    category?: string;
    previewUrl?: string;
    engine: TtsEngine;
}

/**
 * Generate voiceover audio using the specified engine.
 * Applies narrator style (pauses, pacing) before sending to TTS.
 * Returns a Buffer of audio data.
 */
export async function generateVoiceover(options: VoiceoverOptions): Promise<Buffer> {
    const {
        text,
        engine,
        voiceId,
        speed,
        narratorStyle = "documentary",
        speakerWav,
        diaVoiceRef,
        diaVoiceMode,
        diaTranscript,
        diaSeed,
    } = options;

    const styleConfig = getStyleConfig(narratorStyle);
    const effectiveSpeed = speed ?? styleConfig.speed;

    switch (engine) {
        case "elevenlabs": {
            // Apply SSML pause markup for ElevenLabs
            const styledText = applyStyleForElevenLabs(text, narratorStyle);
            return elevenLabsGenerate({
                text: styledText,
                voiceId,
                stability: styleConfig.stability,
                similarityBoost: styleConfig.similarityBoost,
                speed: effectiveSpeed,
            });
        }

        case "xtts": {
            if (!speakerWav || !speakerWav.trim()) {
                console.warn("[TTS] XTTS requested but no speakerWav sample provided. Falling back to edge_tts/elevenlabs...");
                if (process.env.ELEVENLABS_API_KEY) {
                    return generateVoiceover({ ...options, engine: "elevenlabs", voiceId: voiceId || "21m00Tcm4TlvDq8ikWAM" });
                }
                return generateVoiceover({ ...options, engine: "edge_tts", voiceId: voiceId || "en-US-AnaNeural" });
            }
            // XTTS doesn't support SSML — generate per-sentence and stitch
            const segments = splitForXtts(text, narratorStyle);

            if (segments.length <= 1) {
                // Single segment, just generate directly
                return xttsGenerate({
                    text: segments[0]?.text || text,
                    speakerWav,
                    speed: effectiveSpeed,
                });
            }

            // Multi-segment: generate each, then concatenate with silence padding
            // The assembler handles the actual stitching via FFmpeg
            // For preview purposes, we generate the first segment only
            return xttsGenerate({
                text: segments.map(s => s.text).join(" "),
                speakerWav,
                speed: effectiveSpeed,
            });
        }

        case "dia": {
            // Dia — self-hosted on RunPod, supports predefined voices and cloning
            return diaGenerate({
                text,
                voiceRef: diaVoiceRef || voiceId,
                voiceMode: diaVoiceMode || (diaVoiceRef ? "predefined" : "single_s1"),
                transcript: diaTranscript,
                speed: effectiveSpeed,
                seed: diaSeed,
            });
        }

        case "gemini": {
            return geminiGenerate({
                text,
                voiceId,
                speed: effectiveSpeed,
            });
        }

        case "edge_tts": {
            const moneyPrinterUrl = process.env.MONEY_PRINTER_URL || "http://localhost:8085";
            const { applyStructuralMarkup } = await import("./tts/text-formatter");
            const synthesisText = applyStructuralMarkup(text, "edge_tts", voiceId);

            console.log(`[Edge TTS] Sending synthesis request to MoneyPrinter: ${moneyPrinterUrl} for voice ${voiceId}`);
            const audioRes = await fetch(`${moneyPrinterUrl}/api/v1/audio`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    video_script: synthesisText,
                    voice_name: voiceId,
                    bgm_type: "none",
                    bgm_file: "",
                    bgm_volume: 0,
                    voice_volume: 1.0,
                    voice_rate: effectiveSpeed
                })
            });
            if (!audioRes.ok) throw new Error(`EdgeTTS synthesis failed: ${await audioRes.text()}`);

            const createData = await audioRes.json();
            const taskId = (createData.data || createData).task_id;

            let audioBuffer: Buffer | null = null;
            // Poll MoneyPrinter task status
            for (let i = 0; i < 120; i++) {
                await new Promise(r => setTimeout(r, 1000));
                const statusRes = await fetch(`${moneyPrinterUrl}/api/v1/tasks/${taskId}`);
                if (statusRes.ok) {
                    const st = (await statusRes.json());
                    const task = st.data || st;
                    if (task.state === 1) {
                        const audioFetch = await fetch(`${moneyPrinterUrl}/tasks/${taskId}/audio.mp3`);
                        if (!audioFetch.ok) throw new Error("Failed to download EdgeTTS audio file");
                        audioBuffer = Buffer.from(await audioFetch.arrayBuffer());
                        break;
                    }
                    if (task.state === -1) throw new Error(`TTS_TIMEOUT: EdgeTTS failed for voice "${voiceId}"`);
                }
            }
            if (!audioBuffer) {
                throw new Error(`TTS_TIMEOUT: EdgeTTS timed out for voice "${voiceId}"`);
            }
            return audioBuffer;
        }

        default:
            throw new Error(`Unknown TTS engine: ${engine}`);
    }
}

/**
 * List available voices for the specified engine.
 */
export async function listAvailableVoices(engine: TtsEngine): Promise<VoiceInfo[]> {
    switch (engine) {
        case "elevenlabs": {
            const voices = await elevenLabsListVoices();
            return voices.map((v) => ({
                id: v.voice_id,
                name: v.name,
                description: v.description || "",
                category: v.category,
                previewUrl: v.preview_url,
                engine: "elevenlabs" as TtsEngine,
            }));
        }

        case "xtts": {
            const voices = await xttsListVoices();
            return voices.map((v) => ({
                id: v.id,
                name: v.name,
                description: v.description,
                engine: "xtts" as TtsEngine,
            }));
        }

        case "dia": {
            const voices = await diaListVoices();
            return voices.map((v) => ({
                id: v.id,
                name: v.name,
                description: v.description,
                engine: "dia" as TtsEngine,
            }));
        }

        case "gemini": {
            return geminiListVoices().map((v) => ({
                id: v.id,
                name: v.name,
                description: `${v.description} (${v.gender})`,
                engine: "gemini" as TtsEngine,
            }));
        }

        case "edge_tts": {
            const { EDGE_TTS_VOICES_FULL } = await import("./tts/edge-voices");
            return EDGE_TTS_VOICES_FULL.map((v) => ({
                id: v.id,
                name: v.label.split(" (")[0],
                description: v.label,
                engine: "edge_tts" as TtsEngine,
            }));
        }

        default:
            return [];
    }
}

/**
 * Estimate cost for voiceover generation.
 */
export function estimateVoiceoverCost(text: string, engine: TtsEngine): number {
    if (engine === "elevenlabs") {
        return (text.length / 1000) * 0.30; // ~$0.30/1K chars
    }
    return 0; // XTTS and Dia are self-hosted
}

/**
 * Check if Dia TTS is available.
 */
export { diaHealthCheck, geminiHealthCheck };
