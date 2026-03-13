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

export type TtsEngine = "elevenlabs" | "xtts" | "dia";
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
                voiceRef: diaVoiceRef || voiceId, // Use diaVoiceRef if set, fall back to voiceId
                voiceMode: diaVoiceMode || (diaVoiceRef ? "predefined" : "single_s1"),
                speed: effectiveSpeed,
                seed: diaSeed,
            });
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
export { diaHealthCheck };
