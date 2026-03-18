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

// ─── In-memory cache: track which predefined voices are set up as clone refs ───
// Resets on deploy/restart — just avoids re-checking the server 87 times per episode
const _predefinedRefCache = new Set<string>();

/**
 * Concatenate multiple WAV buffers into one seamless WAV file.
 * Strips headers from subsequent files and writes a new combined header.
 */
function concatenateWavBuffers(buffers: Buffer[]): Buffer {
    if (buffers.length === 0) throw new Error("No buffers to concatenate");
    if (buffers.length === 1) return buffers[0];

    // Extract raw PCM data from each WAV buffer (skip headers)
    const pcmParts: Buffer[] = [];
    let sampleRate = 44100;
    let numChannels = 1;
    let bitsPerSample = 16;

    for (let i = 0; i < buffers.length; i++) {
        const buf = buffers[i];
        // Standard WAV header is 44 bytes, but find "data" chunk for safety
        let dataOffset = 44;
        for (let j = 0; j < Math.min(buf.length - 4, 200); j++) {
            if (buf[j] === 0x64 && buf[j+1] === 0x61 && buf[j+2] === 0x74 && buf[j+3] === 0x61) {
                // "data" found — data starts 8 bytes after (4 for "data" + 4 for size)
                dataOffset = j + 8;
                break;
            }
        }

        // Read format from first buffer
        if (i === 0 && buf.length >= 44) {
            numChannels = buf.readUInt16LE(22);
            sampleRate = buf.readUInt32LE(24);
            bitsPerSample = buf.readUInt16LE(34);
        }

        pcmParts.push(buf.subarray(dataOffset));
    }

    const totalPcmLength = pcmParts.reduce((sum, p) => sum + p.length, 0);
    const header = Buffer.alloc(44);
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);

    // RIFF header
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + totalPcmLength, 4);
    header.write("WAVE", 8);
    // fmt sub-chunk
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);       // sub-chunk size
    header.writeUInt16LE(1, 20);        // PCM format
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    // data sub-chunk
    header.write("data", 36);
    header.writeUInt32LE(totalPcmLength, 40);

    return Buffer.concat([header, ...pcmParts]);
}

export async function generateSpeech(options: DiaGenerateOptions): Promise<Buffer> {
    const endpoint = getDiaEndpoint();
    const {
        text,
        voiceRef,
        voiceMode = voiceRef ? "predefined" : "single_s1",
        transcript,
        seed = -1,
        speed = 0.85,
        outputFormat = "wav",
    } = options;

    // Sanitize text for Dia compatibility
    let cleanText = sanitizeForDia(text);

    // Strip any existing [S1]/[S2] tags to avoid doubling
    cleanText = cleanText.replace(/\[S[12]\]\s*/g, "").trim();

    // Very short interjections (< 15 chars like "Exactly—" or "But that's just—")
    // need padding so Dia can generate meaningful audio
    if (cleanText.length < 15) {
        cleanText = `${cleanText}... ... ...`;
    }

    // Send the FULL text to Dia — do NOT pre-split into sentences.
    // Dia's internal split_text + chunk_size handles chunking while maintaining
    // voice consistency, accent, and intonation across the entire passage.
    const diaText = `[S1] ${cleanText}`;

    console.log(`[Dia TTS] Generating: "${diaText.substring(0, 60)}..." (${cleanText.length} chars) | voice: ${voiceRef || "random"} | mode: ${voiceMode}`);

    const isPredefined = voiceMode === "predefined";
    const isClone = voiceMode === "clone" || isPredefined;

    // ─── PREDEFINED VOICES: clone reference + sentence-level generation ───
    // Strategy:
    //   1. Ensure a clone reference exists (cached in-memory across calls)
    //   2. Split long text into sentences (each well under RunPod's ~120s proxy timeout)
    //   3. Generate each sentence via /tts clone mode with quality params
    //   4. Concatenate WAV buffers into one seamless clip
    if (isPredefined && voiceRef) {
        const refName = `pred_${voiceRef}`;

        // ── Step 1: Ensure clone reference exists (in-memory cache) ──
        if (!_predefinedRefCache.has(refName)) {
            // Check server first
            let found = false;
            try {
                const listRes = await fetch(`${endpoint}/get_reference_files`, {
                    signal: AbortSignal.timeout(5000),
                });
                if (listRes.ok) {
                    const data = await listRes.json();
                    const files: string[] = Array.isArray(data) ? data : (data.files || []);
                    found = files.some(f => f.toLowerCase() === refName.toLowerCase());
                }
            } catch { /* ignore */ }

            if (!found) {
                console.log(`[Dia TTS] Creating clone reference: ${voiceRef} → ${refName}`);
                try {
                    const sampleRes = await fetch(`${endpoint}/v1/audio/speech`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            input: "[S1] Hello, this is my voice sample for reference. I speak clearly and naturally.",
                            voice: voiceRef,
                            response_format: "wav",
                            speed: 1.0,
                            seed: 42,
                        }),
                        signal: AbortSignal.timeout(60000),
                    });
                    if (sampleRes.ok) {
                        const buf = await sampleRes.arrayBuffer();
                        const form = new FormData();
                        form.append("files", new Blob([buf], { type: "audio/wav" }), refName);
                        const upRes = await fetch(`${endpoint}/upload_reference`, {
                            method: "POST", body: form,
                            signal: AbortSignal.timeout(15000),
                        });
                        if (upRes.ok) {
                            console.log(`[Dia TTS] ✓ Reference created: ${refName} (${(buf.byteLength / 1024).toFixed(0)}KB)`);
                        }
                    }
                } catch (err: any) {
                    console.warn(`[Dia TTS] Reference creation failed: ${err.message}`);
                }
            } else {
                console.log(`[Dia TTS] Reference already on server: ${refName}`);
            }
            _predefinedRefCache.add(refName); // mark as handled for this session
        }

        // ── Step 2: Split long text into sentences for timeout safety ──
        // RunPod proxy times out at ~120s. Long paragraphs (500+ chars) take 2-4 min.
        // Split into sentences; each sentence ≤ 200 chars generates in ~20-40s.
        const MAX_CHARS_PER_CHUNK = 250;
        let textChunks: string[];

        if (cleanText.length > MAX_CHARS_PER_CHUNK) {
            // Split by sentence boundaries
            const sentences = cleanText.split(/(?<=[.!?])\s+/).filter(s => s.trim());
            textChunks = [];
            let current = "";
            for (const s of sentences) {
                if (current && (current + " " + s).length > MAX_CHARS_PER_CHUNK) {
                    textChunks.push(current.trim());
                    current = s;
                } else {
                    current = current ? current + " " + s : s;
                }
            }
            if (current.trim()) textChunks.push(current.trim());
            console.log(`[Dia TTS] Split ${cleanText.length} chars into ${textChunks.length} chunks for timeout safety`);
        } else {
            textChunks = [cleanText];
        }

        // ── Step 3: Generate each chunk via /tts clone mode ──
        const wavBuffers: Buffer[] = [];
        for (let ci = 0; ci < textChunks.length; ci++) {
            const chunkText = `[S1] ${textChunks[ci]}`;
            const body = {
                text: chunkText,
                voice_mode: "clone",
                clone_reference_filename: refName,
                output_format: outputFormat,
                speed_factor: speed,
                seed,
                split_text: true,
                chunk_size: 200,
                cfg_scale: 4.0,
                temperature: 0.7,
                top_p: 0.85,
                cfg_filter_top_k: 30,
            };

            // 90s timeout — well under RunPod's ~120s proxy limit
            const CHUNK_TIMEOUT = 90000;
            let chunkSuccess = false;

            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), CHUNK_TIMEOUT);

                    const res = await fetch(`${endpoint}/tts`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body),
                        signal: controller.signal,
                    });
                    clearTimeout(timer);

                    if (!res.ok) {
                        const errText = await res.text().catch(() => "");
                        // 400/422 = server doesn't support clone mode, fall back to /v1/audio/speech
                        if (res.status === 400 || res.status === 422) {
                            console.warn(`[Dia TTS] Clone failed (${res.status}), falling back to /v1/audio/speech for chunk ${ci + 1}`);
                            const fbRes = await fetch(`${endpoint}/v1/audio/speech`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    input: chunkText,
                                    voice: voiceRef,
                                    response_format: outputFormat === "wav" ? "wav" : "opus",
                                    speed, seed,
                                }),
                                signal: AbortSignal.timeout(CHUNK_TIMEOUT),
                            });
                            if (fbRes.ok) {
                                wavBuffers.push(Buffer.from(await fbRes.arrayBuffer()));
                                chunkSuccess = true;
                            }
                            break;
                        }
                        if ((res.status === 524 || res.status === 502 || res.status === 503) && attempt < 2) {
                            console.warn(`[Dia TTS] Chunk ${ci + 1}/${textChunks.length} got ${res.status}, retrying...`);
                            await new Promise(r => setTimeout(r, 5000));
                            continue;
                        }
                        throw new Error(`Dia TTS error: ${res.status} — ${errText.substring(0, 150)}`);
                    }

                    wavBuffers.push(Buffer.from(await res.arrayBuffer()));
                    chunkSuccess = true;
                    break;
                } catch (err: any) {
                    if (err.name === "AbortError" && attempt < 2) {
                        console.warn(`[Dia TTS] Chunk ${ci + 1} timed out, retrying...`);
                        await new Promise(r => setTimeout(r, 3000));
                        continue;
                    }
                    throw err;
                }
            }
            if (!chunkSuccess) {
                throw new Error(`Dia TTS: chunk ${ci + 1}/${textChunks.length} failed after retries`);
            }
        }

        // ── Step 4: Concatenate WAV buffers ──
        if (wavBuffers.length === 1) {
            return wavBuffers[0];
        }
        return concatenateWavBuffers(wavBuffers);
    }

    // ─── CLONE / OTHER MODES: use /tts endpoint with full control ───
    const chunkSize = isClone ? 120 : 200;

    const body: Record<string, any> = {
        text: diaText,
        voice_mode: voiceMode,
        output_format: outputFormat,
        speed_factor: speed,
        seed,
        split_text: true,
        chunk_size: chunkSize,
        cfg_scale: 4.0,       // Tighter voice adherence
        temperature: 0.7,     // Less randomness = more consistent
        top_p: 0.85,
        cfg_filter_top_k: 30,
        max_tokens: 3000,     // Prevent truncation on long paragraphs
    };

    if (isClone && voiceRef) {
        body.clone_reference_filename = voiceRef;
        if (transcript) {
            body.transcript = transcript;
            console.log(`[Dia TTS] Using cached transcript (${transcript.length} chars) — skipping Whisper`);
        }
    }

    const MAX_RETRIES = 2;
    const RETRY_DELAYS = [10000];
    const FETCH_TIMEOUT = isClone ? 300000 : 600000;

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
