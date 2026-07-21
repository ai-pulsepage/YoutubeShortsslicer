/**
 * CosyVoice 2 (Alibaba) TTS Engine Integration
 *
 * Supports high-fidelity emotion-controlled voice cloning with inline emotion tags:
 *   [happy], [sad], [angry], [surprised], [fearful], [disgusted]
 */

export interface CosyVoiceOptions {
    text: string;
    speakerWav?: string;
    emotion?: "happy" | "sad" | "angry" | "surprised" | "neutral";
    speed?: number;
}

export async function generateCosyVoice(options: CosyVoiceOptions): Promise<Buffer> {
    const { text, speakerWav, emotion = "neutral", speed = 1.0 } = options;
    const endpoint = process.env.COSYVOICE_WORKER_URL || process.env.RUNPOD_TTS_URL || "http://localhost:8000/tts/cosyvoice";

    // Inject inline emotion tags if provided and not already present
    let formattedText = text;
    if (emotion !== "neutral" && !text.startsWith("[")) {
        formattedText = `[${emotion}] ${text}`;
    }

    console.log(`[CosyVoice 2] Requesting synthesis with emotion: ${emotion}, text: "${formattedText.slice(0, 60)}..."`);

    try {
        const response = await fetch(`${endpoint}/generate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(process.env.RUNPOD_API_KEY ? { "Authorization": `Bearer ${process.env.RUNPOD_API_KEY}` } : {})
            },
            body: JSON.stringify({
                text: formattedText,
                speaker_wav: speakerWav || undefined,
                speed,
                emotion,
            }),
        });

        if (!response.ok) {
            throw new Error(`CosyVoice 2 worker HTTP error: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (err: any) {
        console.warn(`[CosyVoice 2] Synthesis worker unreachable (${err.message}). Using XTTS fallback.`);
        throw err;
    }
}
