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
    voiceRef?: string;      // Predefined voice filename (e.g., "Adrian.wav") or uploaded reference audio filename
    voiceMode?: "single_s1" | "single_s2" | "dialogue" | "clone" | "predefined";
    transcript?: string;    // Pre-computed transcript of reference audio (skips Whisper)
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

// ─── Supported Dia Vocal Effects ────────────────────────
// These must appear in parentheses exactly as listed
const DIA_SUPPORTED_EFFECTS = new Set([
    "(laughs)", "(sighs)", "(clears throat)", "(singing)",
    "(screams)", "(chuckle)", "(inhales)", "(exhales)",
    "(gasps)", "(coughs)", "(sneezes)", "(sniffs)",
    "(groans)", "(burps)", "(sings)", "(humming)",
    "(whistles)", "(mumbles)", "(beep)", "(claps)", "(applause)",
]);

// Map common non-standard parenthetical actions to supported Dia effects
const EFFECT_ALIASES: Record<string, string> = {
    "(audible scoff)": "(sighs)",
    "(scoffs)": "(sighs)",
    "(scoff)": "(sighs)",
    "(muttering)": "(mumbles)",
    "(mutters)": "(mumbles)",
    "(chuckles)": "(chuckle)",
    "(chuckling)": "(chuckle)",
    "(laughing)": "(laughs)",
    "(laughter)": "(laughs)",
    "(sighing)": "(sighs)",
    "(sigh)": "(sighs)",
    "(gasp)": "(gasps)",
    "(gasping)": "(gasps)",
    "(cough)": "(coughs)",
    "(coughing)": "(coughs)",
    "(sneeze)": "(sneezes)",
    "(sneezing)": "(sneezes)",
    "(sniff)": "(sniffs)",
    "(sniffing)": "(sniffs)",
    "(groan)": "(groans)",
    "(groaning)": "(groans)",
    "(screaming)": "(screams)",
    "(scream)": "(screams)",
    "(clap)": "(claps)",
    "(clapping)": "(claps)",
    "(burp)": "(burps)",
    "(burping)": "(burps)",
    "(hums)": "(humming)",
    "(hum)": "(humming)",
    "(whistle)": "(whistles)",
    "(whistling)": "(whistles)",
    "(mumble)": "(mumbles)",
    "(mumbling)": "(mumbles)",
    "(singing softly)": "(singing)",
    "(sings softly)": "(sings)",
    "(exhale)": "(exhales)",
    "(inhale)": "(inhales)",
};

/**
 * Sanitize text for Dia TTS to prevent generation failures.
 *
 * Handles:
 * - Em/en dashes → commas or periods
 * - Smart/curly quotes → straight quotes
 * - Asterisk emphasis (*text*) → plain text
 * - Unsupported parentheticals → mapped to Dia effects or removed
 * - Stage directions like (Nods, allows...) → removed
 * - Excessive ellipses → single pause
 * - Unicode symbols and control characters → removed
 */
function sanitizeForDia(text: string): string {
    let t = text;

    // 1. Replace smart/curly quotes with straight equivalents
    t = t.replace(/[\u2018\u2019\u201A\u201B]/g, "'");   // Single quotes
    t = t.replace(/[\u201C\u201D\u201E\u201F]/g, '"');    // Double quotes

    // 2. Replace em dashes (—) and en dashes (–) with commas or periods
    t = t.replace(/\s*[—–]\s*/g, ", ");  // em/en dash → comma

    // 3. Strip asterisk emphasis: *text* → text
    t = t.replace(/\*([^*]+)\*/g, "$1");

    // 4. Handle parenthetical actions
    // First, map known aliases to supported effects
    for (const [alias, effect] of Object.entries(EFFECT_ALIASES)) {
        t = t.replace(new RegExp(alias.replace(/[()]/g, "\\$&"), "gi"), effect);
    }

    // Remove unsupported parentheticals (stage directions, descriptions)
    // Keep only supported Dia effects
    t = t.replace(/\(([^)]+)\)/g, (match, content) => {
        const lower = `(${content.toLowerCase().trim()})`;
        if (DIA_SUPPORTED_EFFECTS.has(lower)) {
            return lower; // Normalize to lowercase
        }
        // Not a supported effect — remove entirely
        return "";
    });

    // 5. Collapse excessive dots/ellipses (... ... ...) → single ellipsis
    t = t.replace(/\.{2,}/g, "...");
    t = t.replace(/(\.\.\.[\s]*){2,}/g, "... ");

    // 6. Remove other problematic Unicode characters
    t = t.replace(/[\u2026]/g, "...");        // Horizontal ellipsis → ...
    t = t.replace(/[\u00A0]/g, " ");           // Non-breaking space → space
    t = t.replace(/[\u200B-\u200F\uFEFF]/g, ""); // Zero-width chars
    t = t.replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, ""); // Bullet chars

    // 7. Clean up double spaces and leading/trailing whitespace
    t = t.replace(/\s{2,}/g, " ").trim();

    // 8. Remove trailing comma if the sentence ends with one
    t = t.replace(/,\s*$/, ".");

    return t;
}

export async function generateSpeech(options: DiaGenerateOptions): Promise<Buffer> {
    const endpoint = getDiaEndpoint();
    const {
        text,
        voiceRef,
        voiceMode = voiceRef ? "predefined" : "single_s1",
        transcript,
        seed = -1,
        speed = 1.0,
        outputFormat = "wav",
    } = options;

    // Sanitize text for Dia compatibility
    let cleanText = sanitizeForDia(text);

    // Strip any existing [S1]/[S2] tags to avoid doubling
    cleanText = cleanText.replace(/\[S[12]\]\s*/g, "").trim();

    // Very short interjections (< 15 chars like "Exactly—" or "But that's just—")
    // need padding so Dia can generate meaningful audio
    if (cleanText.length < 15) {
        // Pad with a natural trailing pause to give Dia enough material
        cleanText = `${cleanText}... ... ...`;
    }

    // Add [S1] prefix for single-speaker generation (only once)
    const diaText = `[S1] ${cleanText}`;

    console.log(`[Dia TTS] Generating: "${diaText.substring(0, 60)}..." | voice: ${voiceRef || "random"} | mode: ${voiceMode}`);

    // Clone mode is ~3-5x slower — use smaller chunks to stay under Cloudflare's 100s timeout
    const isClone = voiceMode === "clone";
    const chunkSize = isClone ? 100 : 120;

    // Use the full-control /tts endpoint for maximum flexibility
    const body: Record<string, any> = {
        text: diaText,
        voice_mode: voiceMode,
        output_format: outputFormat,
        speed_factor: speed,
        seed,
        split_text: true,
        chunk_size: chunkSize,
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
        // Pass pre-computed transcript to skip Whisper entirely
        if (transcript) {
            body.transcript = transcript;
            console.log(`[Dia TTS] Using cached transcript (${transcript.length} chars) — skipping Whisper`);
        }
    }

    // Retry logic for Cloudflare 524 timeouts (transient — the Dia server is just slow, not broken)
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [5000, 15000]; // 5s, then 15s between retries
    const FETCH_TIMEOUT = 120000; // 120s — clone mode needs more time than Cloudflare's ~100s limit

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

            const response = await fetch(`${endpoint}/tts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const errText = await response.text().catch(() => "");

                // Retry on 524 (Cloudflare timeout) or 502/503 (server overload)
                if ((response.status === 524 || response.status === 502 || response.status === 503) && attempt < MAX_RETRIES) {
                    const delay = RETRY_DELAYS[attempt - 1] || 15000;
                    console.warn(`[Dia TTS] Attempt ${attempt}/${MAX_RETRIES} got ${response.status} — retrying in ${delay / 1000}s...`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }

                throw new Error(`Dia TTS error: ${response.status} — ${errText.substring(0, 200)}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            if (attempt > 1) {
                console.log(`[Dia TTS] Succeeded on attempt ${attempt}`);
            }
            return Buffer.from(arrayBuffer);
        } catch (err: any) {
            if (err.name === "AbortError" && attempt < MAX_RETRIES) {
                const delay = RETRY_DELAYS[attempt - 1] || 15000;
                console.warn(`[Dia TTS] Attempt ${attempt}/${MAX_RETRIES} timed out — retrying in ${delay / 1000}s...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw err;
        }
    }

    throw new Error("Dia TTS: max retries exceeded");
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
