/**
 * Narrator Style Framework
 *
 * Transforms raw narration text into properly paced markup with pauses.
 * Uses SSML <break> tags for ElevenLabs, silence markers for XTTS.
 *
 * Styles:
 *   sleep         — Long pauses, very slow, contemplative (sleep aid documentaries)
 *   documentary   — Natural pauses, measured pace (BBC Earth, Planet Earth)
 *   dramatic      — Shorter pauses, more vocal intensity
 *   energetic     — Fast pace, minimal pauses (YouTube explainers)
 *   conversational — Natural speech rhythm, warm
 */

export type NarratorStyle = "sleep" | "documentary" | "dramatic" | "energetic" | "conversational";
export type TtsEngineType = "elevenlabs" | "xtts";

export interface StyleConfig {
    speed: number;
    pauseAfterSentence: number;   // seconds
    pauseAfterParagraph: number;  // seconds
    pauseAfterComma: number;      // seconds
    stability: number;            // 0-1 (ElevenLabs voice stability)
    similarityBoost: number;      // 0-1 (ElevenLabs similarity boost)
}

const STYLES: Record<NarratorStyle, StyleConfig> = {
    sleep: {
        speed: 0.85,
        pauseAfterSentence: 2.0,
        pauseAfterParagraph: 3.5,
        pauseAfterComma: 0.8,
        stability: 0.85,
        similarityBoost: 0.8,
    },
    documentary: {
        speed: 0.92,
        pauseAfterSentence: 1.2,
        pauseAfterParagraph: 2.0,
        pauseAfterComma: 0.4,
        stability: 0.7,
        similarityBoost: 0.75,
    },
    dramatic: {
        speed: 0.95,
        pauseAfterSentence: 0.8,
        pauseAfterParagraph: 1.5,
        pauseAfterComma: 0.3,
        stability: 0.5,
        similarityBoost: 0.7,
    },
    energetic: {
        speed: 1.1,
        pauseAfterSentence: 0.4,
        pauseAfterParagraph: 0.8,
        pauseAfterComma: 0.2,
        stability: 0.6,
        similarityBoost: 0.65,
    },
    conversational: {
        speed: 0.85,
        pauseAfterSentence: 0.7,
        pauseAfterParagraph: 1.2,
        pauseAfterComma: 0.3,
        stability: 0.65,
        similarityBoost: 0.75,
    },
};

/**
 * Get the full style config for a narrator style.
 */
export function getStyleConfig(style: NarratorStyle): StyleConfig {
    return STYLES[style] || STYLES.documentary;
}

/**
 * Apply narrator style to text for ElevenLabs (SSML <break> tags).
 *
 * Transforms:
 *   "The stars burned bright. Above the mountains, a glow appeared."
 * Into (sleep style):
 *   "The stars burned bright. <break time=\"2.0s\"/> Above the mountains, <break time=\"0.8s\"/> a glow appeared. <break time=\"2.0s\"/>"
 */
export function applyStyleForElevenLabs(text: string, style: NarratorStyle): string {
    const config = getStyleConfig(style);

    let result = text;

    // Insert paragraph breaks (double newline)
    result = result.replace(
        /\n\n+/g,
        ` <break time="${config.pauseAfterParagraph}s"/> `
    );

    // Insert sentence breaks (after . ! ?)
    // Look behind for sentence-ending punctuation followed by space/newline
    result = result.replace(
        /([.!?])\s+/g,
        `$1 <break time="${config.pauseAfterSentence}s"/> `
    );

    // Insert comma pauses (only for styles with significant pauses)
    if (config.pauseAfterComma >= 0.4) {
        result = result.replace(
            /,\s+/g,
            `, <break time="${config.pauseAfterComma}s"/> `
        );
    }

    // Insert ellipsis pauses (... → extra long pause)
    result = result.replace(
        /\.\.\.\s*/g,
        `... <break time="${config.pauseAfterSentence * 1.5}s"/> `
    );

    return result.trim();
}

/**
 * Split text into segments for XTTS (which doesn't support SSML).
 * Returns an array of { text, pauseAfter } segments.
 * The caller generates each segment separately and inserts silence between them.
 */
export function splitForXtts(
    text: string,
    style: NarratorStyle
): { text: string; pauseAfterMs: number }[] {
    const config = getStyleConfig(style);
    const segments: { text: string; pauseAfterMs: number }[] = [];

    // Split by paragraph first
    const paragraphs = text.split(/\n\n+/).filter(Boolean);

    for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i].trim();

        // Split by sentence within paragraph
        const sentences = paragraph
            .split(/(?<=[.!?])\s+/)
            .filter(Boolean);

        for (let j = 0; j < sentences.length; j++) {
            const sentence = sentences[j].trim();
            if (!sentence) continue;

            const isLastInParagraph = j === sentences.length - 1;
            const isLastParagraph = i === paragraphs.length - 1;

            let pauseMs: number;
            if (isLastInParagraph && !isLastParagraph) {
                pauseMs = config.pauseAfterParagraph * 1000;
            } else if (isLastInParagraph && isLastParagraph) {
                pauseMs = 0; // No trailing pause
            } else {
                pauseMs = config.pauseAfterSentence * 1000;
            }

            segments.push({
                text: sentence,
                pauseAfterMs: pauseMs,
            });
        }
    }

    return segments;
}
