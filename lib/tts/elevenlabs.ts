/**
 * ElevenLabs TTS Engine
 *
 * Premium text-to-speech via ElevenLabs API.
 * Supports SSML <break> tags for pause control.
 */

export interface ElevenLabsVoice {
    voice_id: string;
    name: string;
    category: string;
    description?: string;
    preview_url?: string;
    labels?: Record<string, string>;
}

interface GenerateOptions {
    text: string;
    voiceId: string;
    modelId?: string;
    stability?: number;
    similarityBoost?: number;
    speed?: number;
}

function getApiKey(): string {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) throw new Error("ELEVENLABS_API_KEY not configured");
    return key;
}

/**
 * Generate speech audio from text using ElevenLabs.
 * Returns a Buffer of MP3 audio.
 */
export async function generateSpeech(options: GenerateOptions): Promise<Buffer> {
    const apiKey = getApiKey();
    const {
        text,
        voiceId,
        modelId = "eleven_multilingual_v2",
        stability = 0.7,
        similarityBoost = 0.75,
        speed = 1.0,
    } = options;

    const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "xi-api-key": apiKey,
            },
            body: JSON.stringify({
                text,
                model_id: modelId,
                voice_settings: {
                    stability,
                    similarity_boost: similarityBoost,
                    speed,
                },
            }),
        }
    );

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`ElevenLabs TTS error: ${response.status} — ${err}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

/**
 * List all available voices from ElevenLabs account.
 */
export async function listVoices(): Promise<ElevenLabsVoice[]> {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) {
        console.warn("[ElevenLabs] ELEVENLABS_API_KEY not set — cannot list voices");
        return [];
    }

    const response = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": key },
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error(`[ElevenLabs] List voices failed: ${response.status} — ${errText}`);
        throw new Error(`ElevenLabs API returned ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const voices = (data.voices || []).map((v: any) => ({
        voice_id: v.voice_id,
        name: v.name,
        category: v.category || "premade",
        description: v.labels?.description || v.labels?.accent || "",
        preview_url: v.preview_url,
        labels: v.labels,
    }));

    console.log(`[ElevenLabs] Loaded ${voices.length} voices`);
    return voices;
}

/**
 * Estimate cost for ElevenLabs generation.
 * ~$0.30 per 1K characters on Creator plan.
 */
export function estimateCost(text: string): number {
    return (text.length / 1000) * 0.30;
}
