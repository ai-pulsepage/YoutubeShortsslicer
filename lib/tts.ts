/**
 * Together.ai Kokoro TTS Service
 */

export interface VoiceoverOptions {
    text: string;
    voiceId: string;
    speed?: number; // 0.5 - 2.0
}

/**
 * Generate voiceover audio using Together.ai Kokoro
 * Returns a Buffer of WAV audio
 */
export async function generateVoiceover(options: VoiceoverOptions): Promise<Buffer> {
    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) throw new Error("TOGETHER_API_KEY not configured");

    const response = await fetch("https://api.together.xyz/v1/audio/speech", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: "kokoro",
            input: options.text,
            voice: options.voiceId,
            speed: options.speed || 1.0,
            response_format: "wav",
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Kokoro TTS error: ${response.status} — ${err}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

/**
 * Estimate cost for voiceover generation
 * Kokoro: ~$4/1M characters
 */
export function estimateVoiceoverCost(text: string): number {
    const chars = text.length;
    const costPerChar = 4 / 1_000_000; // $4/1M chars
    return chars * costPerChar;
}
