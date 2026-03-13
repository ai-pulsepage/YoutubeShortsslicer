/**
 * Dia TTS Engine (Nari Labs)
 *
 * Self-hosted on RunPod via Dia-TTS-Server.
 * Supports:
 *   - Predefined voices (43 built-in voices, instant start)
 *   - Voice cloning (5-10s reference WAV, highest quality)
 *   - Non-verbal cues: (laughs), (sighs), (clears throat), etc.
 *
 * API: OpenAI-compatible `/v1/audio/speech` + full-control `/tts`
 * Model: nari-labs/Dia-1.6B — Apache 2.0
 */

interface DiaGenerateOptions {
    text: string;
    voiceRef?: string;      // Predefined voice filename (e.g., "voice_01.wav") or reference audio filename
    voiceMode?: "single_s1" | "single_s2" | "dialogue" | "clone" | "predefined";
    seed?: number;          // Fixed seed for consistency (-1 for random)
    speed?: number;         // 0.5-2.0
    outputFormat?: "wav" | "opus";
}

interface DiaVoice {
    id: string;
    name: string;
    description: string;
    filename: string;
}

function getDiaEndpoint(): string {
    const url = process.env.DIA_TTS_URL;
    if (!url) {
        throw new Error(
            "DIA_TTS_URL not configured — set it to your RunPod Dia-TTS-Server URL (e.g., https://xxx-8003.proxy.runpod.net)"
        );
    }
    return url.replace(/\/$/, ""); // Remove trailing slash
}

/**
 * Generate speech via Dia TTS Server.
 * Returns a Buffer of WAV audio.
 *
 * For podcast use: each character line is generated individually with
 * their voice reference, using [S1] tag for single-speaker mode.
 */
export async function generateSpeech(options: DiaGenerateOptions): Promise<Buffer> {
    const endpoint = getDiaEndpoint();
    const {
        text,
        voiceRef,
        voiceMode = voiceRef ? "predefined" : "single_s1",
        seed = -1,
        speed = 1.0,
        outputFormat = "wav",
    } = options;

    // Format text with [S1] tag for Dia — required for single-speaker mode
    // Strip any existing [S1]/[S2] tags to avoid doubling
    let diaText = text.replace(/\[S[12]\]\s*/g, "").trim();

    // Add [S1] prefix for single-speaker generation
    diaText = `[S1] ${diaText}`;

    // Ensure minimum text length (Dia needs >5s worth of text)
    // ~86 tokens per second, ~15 chars per second
    if (diaText.length < 20) {
        diaText = `[S1] ${diaText}. `;
    }

    console.log(`[Dia TTS] Generating: "${diaText.substring(0, 60)}..." | voice: ${voiceRef || "random"} | mode: ${voiceMode}`);

    // Use the full-control /tts endpoint for maximum flexibility
    const body: Record<string, any> = {
        text: diaText,
        voice_mode: voiceMode,
        output_format: outputFormat,
        speed_factor: speed,
        seed,
        split_text: true,
        chunk_size: 120,
        // Generation quality params
        cfg_scale: 3.0,
        temperature: 1.3,
        top_p: 0.95,
        cfg_filter_top_k: 35,
    };

    // Set voice reference based on mode
    if (voiceMode === "predefined" && voiceRef) {
        body.clone_reference_filename = voiceRef;
    } else if (voiceMode === "clone" && voiceRef) {
        body.clone_reference_filename = voiceRef;
    }

    const response = await fetch(`${endpoint}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const err = await response.text().catch(() => "");
        throw new Error(`Dia TTS error: ${response.status} — ${err}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

/**
 * Generate speech using the simpler OpenAI-compatible endpoint.
 * Good for quick generation with predefined voices.
 */
export async function generateSpeechSimple(
    text: string,
    voice: string = "S1",
    speed: number = 1.0,
    seed: number = -1,
): Promise<Buffer> {
    const endpoint = getDiaEndpoint();

    const response = await fetch(`${endpoint}/v1/audio/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            input: text,
            voice, // S1, S2, dialogue, or predefined voice filename
            response_format: "wav",
            speed,
            seed,
        }),
    });

    if (!response.ok) {
        const err = await response.text().catch(() => "");
        throw new Error(`Dia TTS (simple) error: ${response.status} — ${err}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

/**
 * List predefined voices available on the Dia-TTS-Server.
 * These are WAV files in the server's ./voices/ directory.
 */
export async function listVoices(): Promise<DiaVoice[]> {
    // Dia-TTS-Server comes with 43 predefined voices
    // We return a curated selection suitable for podcast characters
    // The actual voice files are on the RunPod pod in /app/voices/
    return [
        { id: "dia_voice_01", name: "Male - Deep Authority", description: "Deep, authoritative male voice — good for hosts/moderators", filename: "voice_01.wav" },
        { id: "dia_voice_02", name: "Male - Casual Young", description: "Casual younger male voice — good for informal guests", filename: "voice_02.wav" },
        { id: "dia_voice_03", name: "Male - Warm Midwest", description: "Warm, measured midwestern tone", filename: "voice_03.wav" },
        { id: "dia_voice_04", name: "Female - Professional", description: "Clear, professional female voice", filename: "voice_04.wav" },
        { id: "dia_voice_05", name: "Female - Energetic", description: "Energetic, upbeat female voice", filename: "voice_05.wav" },
        { id: "dia_voice_06", name: "Male - Gravel Veteran", description: "Gravelly veteran voice — great for opinionated characters", filename: "voice_06.wav" },
        { id: "dia_voice_07", name: "Male - Academic", description: "Precise, intellectual male voice — good for expert characters", filename: "voice_07.wav" },
        { id: "dia_voice_08", name: "Female - Southern Warmth", description: "Warm southern accent", filename: "voice_08.wav" },
    ];
    // Note: Once the RunPod pod is running, you can see all 43 voices
    // at http://<pod-url>/docs (Swagger UI) or the web UI
}

/**
 * Check if Dia TTS Server is reachable and healthy.
 */
export async function healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
        const endpoint = getDiaEndpoint();
        const response = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(5000) });
        if (response.ok) {
            return { healthy: true, message: "Dia TTS Server is running" };
        }
        return { healthy: false, message: `Dia TTS Server returned ${response.status}` };
    } catch (err: any) {
        return { healthy: false, message: `Dia TTS Server unreachable: ${err.message}` };
    }
}

/**
 * Estimate cost for Dia generation.
 * Self-hosted on RunPod: only GPU rental cost, no per-request charges.
 */
export function estimateCost(_text: string): number {
    return 0; // Self-hosted
}
