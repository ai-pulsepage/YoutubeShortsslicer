/**
 * Gemini TTS Engine
 *
 * Uses Google's Gemini 2.5 Flash Preview TTS model via the
 * Generative Language REST API.
 *
 * Available voices (all English-primary):
 *   Aoede, Charon, Fenrir, Kore, Puck, Leda, Orus, Zephyr,
 *   Callirrhoe, Autonoe, Enceladus, Iapetus, Umbriel, Algieba,
 *   Despina, Erinome, Algenib, Rasalgethi, Laomedeia, Achernar,
 *   Alnilam, Schedar, Gacrux, Pulcherrima, Achird, Zubenelgenubi,
 *   Vindemiatrix, Sadachbia, Sadaltager, Sulafat
 *
 * Returns a Buffer of raw PCM (L16, 24000 Hz) wrapped in a WAV header.
 * The voice generate route converts this to MP3 before uploading to R2.
 */

import { prisma } from "@/lib/prisma";

export interface GeminiVoice {
    id: string;
    name: string;
    description: string;
    gender: "male" | "female" | "neutral";
}

export const GEMINI_VOICES: GeminiVoice[] = [
    { id: "Aoede",         name: "Aoede",         description: "Warm, expressive female",      gender: "female"  },
    { id: "Charon",        name: "Charon",        description: "Deep, authoritative male",      gender: "male"    },
    { id: "Fenrir",        name: "Fenrir",        description: "Bold, energetic male",          gender: "male"    },
    { id: "Kore",          name: "Kore",          description: "Soft, gentle female",           gender: "female"  },
    { id: "Puck",          name: "Puck",          description: "Playful, bright male",          gender: "male"    },
    { id: "Leda",          name: "Leda",          description: "Elegant, refined female",       gender: "female"  },
    { id: "Orus",          name: "Orus",          description: "Calm, neutral male",            gender: "male"    },
    { id: "Zephyr",        name: "Zephyr",        description: "Light, airy neutral",           gender: "neutral" },
    { id: "Callirrhoe",    name: "Callirrhoe",    description: "Smooth, melodic female",        gender: "female"  },
    { id: "Autonoe",       name: "Autonoe",       description: "Clear, articulate female",      gender: "female"  },
    { id: "Enceladus",     name: "Enceladus",     description: "Resonant, full male",           gender: "male"    },
    { id: "Iapetus",       name: "Iapetus",       description: "Steady, measured male",         gender: "male"    },
    { id: "Umbriel",       name: "Umbriel",       description: "Dark, mysterious neutral",      gender: "neutral" },
    { id: "Algieba",       name: "Algieba",       description: "Warm, friendly male",          gender: "male"    },
    { id: "Despina",       name: "Despina",       description: "Bright, cheerful female",       gender: "female"  },
    { id: "Erinome",       name: "Erinome",       description: "Flowing, narrative female",     gender: "female"  },
    { id: "Achernar",      name: "Achernar",      description: "Crisp, precise neutral",        gender: "neutral" },
    { id: "Alnilam",       name: "Alnilam",       description: "Balanced, natural male",        gender: "male"    },
    { id: "Schedar",       name: "Schedar",       description: "Strong, confident male",        gender: "male"    },
    { id: "Gacrux",        name: "Gacrux",        description: "Rich, expressive female",       gender: "female"  },
    { id: "Sulafat",       name: "Sulafat",       description: "Gentle, soothing female",       gender: "female"  },
];

async function getApiKey(): Promise<string> {
    const envKey = process.env.GEMINI_API_KEY;
    if (envKey) return envKey;

    try {
        const record = await prisma.apiKey.findUnique({
            where: { service: "gemini_api_key" }
        });
        if (record?.key) {
            return Buffer.from(record.key, "base64").toString("utf8");
        }
    } catch (err: any) {
        console.warn(`[Gemini TTS] DB key lookup failed: ${err.message}`);
    }

    throw new Error("GEMINI_API_KEY not configured — set in .env or Admin → API Keys");
}

/**
 * Wrap raw L16 PCM bytes in a RIFF WAV header.
 */
function pcmToWav(pcmBuffer: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
    const dataSize = pcmBuffer.length;
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);             // PCM chunk size
    header.writeUInt16LE(1, 20);              // PCM format
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
    header.writeUInt16LE(channels * (bitsPerSample / 8), 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write("data", 36);
    header.writeUInt32LE(dataSize, 40);
    return Buffer.concat([header, pcmBuffer]);
}

/**
 * Generate speech audio using Gemini 2.5 Flash TTS.
 * Returns a Buffer of WAV audio.
 */
export async function generateSpeech(options: {
    text: string;
    voiceId?: string;
    speed?: number;
}): Promise<Buffer> {
    const apiKey = await getApiKey();
    const voiceName = options.voiceId || "Kore";

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

    const prompt = `# AUDIO PROFILE
Style: Warm and expressive
Voice Tone: Clear narrator

## THE SCENE
Context: Speak exactly the transcript text out loud. Do not reply, answer, or add any comment.

### TRANSCRIPT
${options.text}`;

    const body = {
        contents: [
            {
                parts: [{ text: prompt }]
            }
        ],
        generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: {
                        voiceName
                    }
                }
            }
        }
    };

    console.log(`[Gemini TTS] Synthesizing with voice "${voiceName}": "${options.text.slice(0, 60)}..."`);

    const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`Gemini TTS API error ${response.status}: ${errText}`);
    }

    const data = await response.json();

    // Extract base64 PCM audio from response
    const part = data?.candidates?.[0]?.content?.parts?.[0];
    if (!part?.inlineData?.data) {
        throw new Error("Gemini TTS returned no audio data in response");
    }

    const pcmBuffer = Buffer.from(part.inlineData.data, "base64");
    // Gemini returns raw L16 PCM at 24000 Hz mono — wrap in WAV header
    return pcmToWav(pcmBuffer, 24000, 1, 16);
}

/**
 * List available Gemini TTS voices.
 */
export function listVoices(): GeminiVoice[] {
    return GEMINI_VOICES;
}

/**
 * Test Gemini TTS connectivity with a short phrase.
 */
export async function healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
        await generateSpeech({ text: "Hello.", voiceId: "Kore" });
        return { ok: true, message: "Gemini TTS connected successfully" };
    } catch (err: any) {
        return { ok: false, message: err.message };
    }
}
