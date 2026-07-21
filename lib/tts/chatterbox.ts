/**
 * Chatterbox (Resemble AI) TTS Engine Integration
 *
 * Open-source zero-shot voice cloning with emotion exaggeration controls (MIT License).
 */

export interface ChatterboxOptions {
    text: string;
    speakerWav?: string;
    exaggeration?: number; // 0.0 (subtle) to 2.0 (dramatic)
    speed?: number;
}

export async function generateChatterbox(options: ChatterboxOptions): Promise<Buffer> {
    const { text, speakerWav, exaggeration = 1.0, speed = 1.0 } = options;
    const endpoint = process.env.CHATTERBOX_WORKER_URL || process.env.RUNPOD_TTS_URL || "http://localhost:8000/tts/chatterbox";

    console.log(`[Chatterbox] Requesting synthesis (exaggeration: ${exaggeration}) for: "${text.slice(0, 60)}..."`);

    try {
        const response = await fetch(`${endpoint}/generate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(process.env.RUNPOD_API_KEY ? { "Authorization": `Bearer ${process.env.RUNPOD_API_KEY}` } : {})
            },
            body: JSON.stringify({
                text,
                speaker_wav: speakerWav || undefined,
                exaggeration,
                speed,
            }),
        });

        if (!response.ok) {
            throw new Error(`Chatterbox worker HTTP error: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (err: any) {
        console.warn(`[Chatterbox] Synthesis worker unreachable (${err.message}). Falling back.`);
        throw err;
    }
}
