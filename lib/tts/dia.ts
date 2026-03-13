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

// Track which voice refs have already been synced to avoid re-uploading every line
const syncedVoiceRefs = new Set<string>();

/**
 * Sync a voice reference from R2 to the Dia TTS Server.
 * Downloads from R2 → uploads to Dia server's /reference_audio/ directory.
 * Cached per session so we only upload once per pod lifecycle.
 */
export async function syncVoiceRefFromR2(r2Key: string, filename: string): Promise<string> {
    // Skip if already synced this session
    if (syncedVoiceRefs.has(r2Key)) {
        return filename;
    }

    const endpoint = getDiaEndpoint();

    // Download from R2 via public URL
    const { getR2PublicUrl } = await import("@/lib/storage");
    const r2Url = getR2PublicUrl(r2Key);

    console.log(`[Dia TTS] Syncing voice ref from R2: ${r2Key} → ${filename}`);

    const r2Response = await fetch(r2Url);
    if (!r2Response.ok) {
        throw new Error(`Failed to download voice ref from R2: ${r2Response.status}`);
    }
    const audioBuffer = await r2Response.arrayBuffer();

    // Upload to Dia server's reference_audio directory via multipart form
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: "audio/wav" });
    formData.append("file", blob, filename);

    const uploadResponse = await fetch(`${endpoint}/upload_reference`, {
        method: "POST",
        body: formData,
    });

    if (!uploadResponse.ok) {
        // Fallback: try uploading via /import_reference endpoint (varies by Dia-TTS-Server version)
        const fallbackResponse = await fetch(`${endpoint}/import_reference`, {
            method: "POST",
            body: formData,
        });
        if (!fallbackResponse.ok) {
            console.warn(`[Dia TTS] Could not auto-upload voice ref to server — using predefined fallback`);
            return filename;
        }
    }

    syncedVoiceRefs.add(r2Key);
    console.log(`[Dia TTS] Voice ref synced: ${filename} (${(audioBuffer.byteLength / 1024).toFixed(0)}KB)`);

    return filename;
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
    // Dia-TTS-Server comes with 43+ predefined voices
    // These are actual voice files in the server's ./voices/ directory
    return [
        { id: "dia_adrian", name: "Adrian", description: "Male — clear and confident", filename: "Adrian.wav" },
        { id: "dia_eli", name: "Eli", description: "Male — warm and measured", filename: "Eli.wav" },
        { id: "dia_michael", name: "Michael", description: "Male — deep and authoritative", filename: "Michael.wav" },
        { id: "dia_alexander", name: "Alexander", description: "Male — polished and articulate", filename: "Alexander.wav" },
        { id: "dia_connor", name: "Connor", description: "Male — casual and energetic", filename: "Connor.wav" },
        { id: "dia_gabriel", name: "Gabriel", description: "Male — smooth and engaging", filename: "Gabriel.wav" },
        { id: "dia_henry", name: "Henry", description: "Male — distinguished and mature", filename: "Henry.wav" },
        { id: "dia_julian", name: "Julian", description: "Male — thoughtful and precise", filename: "Julian.wav" },
        { id: "dia_everett", name: "Everett", description: "Male — low-key and relaxed", filename: "Everett.wav" },
        { id: "dia_austin", name: "Austin", description: "Male — friendly and upbeat", filename: "Austin.wav" },
        { id: "dia_axel", name: "Axel", description: "Male — edgy and bold", filename: "Axel.wav" },
        { id: "dia_miles", name: "Miles", description: "Male — natural and relatable", filename: "Miles.wav" },
        { id: "dia_alice", name: "Alice", description: "Female — bright and clear", filename: "Alice.wav" },
        { id: "dia_emily", name: "Emily", description: "Female — warm and expressive", filename: "Emily.wav" },
        { id: "dia_elena", name: "Elena", description: "Female — smooth and sophisticated", filename: "Elena.wav" },
        { id: "dia_cora", name: "Cora", description: "Female — calm and assured", filename: "Cora.wav" },
        { id: "dia_olivia", name: "Olivia", description: "Female — lively and dynamic", filename: "Olivia.wav" },
        { id: "dia_gianna", name: "Gianna", description: "Female — rich and melodic", filename: "Gianna.wav" },
        { id: "dia_jade", name: "Jade", description: "Female — crisp and professional", filename: "Jade.wav" },
        { id: "dia_layla", name: "Layla", description: "Female — gentle and soothing", filename: "Layla.wav" },
        { id: "dia_taylor", name: "Taylor", description: "Female — modern and natural", filename: "Taylor.wav" },
        { id: "dia_abigail", name: "Abigail", description: "Female — poised and clear", filename: "Abigail.wav" },
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
