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

export type TtsEngine = "elevenlabs" | "xtts";
export type { NarratorStyle } from "./tts/narrator-style";

export interface VoiceoverOptions {
    text: string;
    engine: TtsEngine;
    voiceId: string;
    speed?: number;
    narratorStyle?: NarratorStyle;
    speakerWav?: string; // XTTS voice clone sample (R2 URL)
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
    return 0; // XTTS is self-hosted
}
