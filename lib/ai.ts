/**
 * AI Service — Centralized AI model access
 * - DeepSeek V3.2 (primary segmentation)
 * - Gemini 1.5 Flash (fallback)
 * - Together.ai / Qwen (lightweight tasks)
 */

export interface SegmentSuggestion {
    start: number;  // seconds
    end: number;    // seconds
    title: string;
    description: string;
    hookStrength: number;    // 1-10
    emotionalArc: number;    // 1-10
    completeness: number;    // 1-10
    overallScore: number;    // 1-10
}

interface TranscriptSegment {
    start: number;
    end: number;
    text: string;
}

const SEGMENTATION_PROMPT = `You are a viral short-form content expert. Analyze this video transcript and identify EVERY distinct story, scene, or topic that would make compelling YouTube Shorts.

YOUR PRIMARY OBJECTIVE: Find EVERY distinct story, scene, or topic transition in the transcript. Do NOT skip sections — cover the ENTIRE transcript from beginning to end.

STORY RULES:
1. **Capture COMPLETE stories** — from natural beginning to natural end
2. **If a story is ≤60 seconds** → ONE segment covering it entirely
3. **If a story is >60 seconds** → split into sequential parts:
   - Count the total parts FIRST, then name them correctly
   - "Story Title (Part 1 of 3)" → "Story Title (Part 2 of 3)" → "Story Title (Part 3 of 3)"
   - Parts should overlap by ~2 seconds for smooth transitions
   - The "of N" number MUST match the actual total number of parts
4. **Each segment must be 30-60 seconds** (sweet spot: 40-55s)
5. **NO OVERLAP between different stories** — each story's time range is exclusive
6. **Cover the ENTIRE transcript** — do NOT skip any section. Every minute of content should be analyzed
7. **If content seems transitional**, still identify it as a segment with a descriptive title

IMPORTANT: You MUST find segments throughout the ENTIRE time range provided. If the transcript covers 0:00 to 10:00, you should have segments spread across that full range, not clustered at the start or end.

IDENTIFICATION CRITERIA:
- Topic shifts — when a new animal, scene, location, or subject begins
- Self-contained narrative arcs (mini-stories with beginning, middle, end)
- Emotional moments — surprising, dramatic, or heartwarming scenes
- Natural speech boundaries — never cut mid-sentence

TIMESTAMPS:
- Start and end must be ABSOLUTE timestamps in SECONDS from the beginning of the FULL video
- Use the transcript timestamps directly — they show the exact position
- Each segment's start/end must align with natural speech boundaries

Score each segment 1-10 on:
- hookStrength: How attention-grabbing is the opening?
- emotionalArc: Does it have a satisfying emotional journey?
- completeness: Is it a self-contained piece that makes sense alone?

Respond ONLY with valid JSON array. No markdown, no explanation:
[
  {
    "start": 125.0,
    "end": 170.5,
    "title": "Killer Whales Hunt Grey Whale Calf (Part 1 of 3)",
    "description": "A pod of killer whales coordinates to separate a grey whale calf from its mother",
    "hookStrength": 9,
    "emotionalArc": 8,
    "completeness": 9,
    "overallScore": 9
  },
  {
    "start": 170.5,
    "end": 225.0,
    "title": "Killer Whales Hunt Grey Whale Calf (Part 2 of 3)",
    "description": "The hunt intensifies as the pod coordinates their attack",
    "hookStrength": 7,
    "emotionalArc": 9,
    "completeness": 8,
    "overallScore": 8
  }
]`;

/**
 * Call DeepSeek V3.2 for segmentation
 */
export async function segmentWithDeepSeek(
    transcript: TranscriptSegment[],
    videoDuration: number
): Promise<SegmentSuggestion[]> {
    let apiKey = process.env.DEEPSEEK_API_KEY;
    const apiBase = process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com";

    if (!apiKey) {
        apiKey = await getDbApiKey("deepseek_api_key") || undefined;
    }
    if (!apiKey) throw new Error("DEEPSEEK_API_KEY not configured");

    const transcriptText = formatTranscript(transcript);
    const timeRange = transcript.length > 0
        ? `from ${formatTimeHMS(transcript[0].start)} to ${formatTimeHMS(transcript[transcript.length - 1].end)}`
        : "";

    const response = await fetch(`${apiBase}/v1/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
                { role: "system", content: SEGMENTATION_PROMPT },
                {
                    role: "user",
                    content: `Video total duration: ${videoDuration} seconds (${formatTimeHMS(videoDuration)})\nThis transcript chunk covers ${timeRange}.\n\nTranscript:\n${transcriptText}`,
                },
            ],
            temperature: 0.3,
            max_tokens: 8192,
            response_format: { type: "json_object" },
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`DeepSeek API error: ${response.status} — ${err}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) throw new Error("Empty response from DeepSeek");

    return parseSegments(content, videoDuration);
}

/**
 * Fallback: Call Gemini 1.5 Flash for segmentation
 */
export async function segmentWithGemini(
    transcript: TranscriptSegment[],
    videoDuration: number
): Promise<SegmentSuggestion[]> {
    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        apiKey = await getDbApiKey("gemini_api_key") || undefined;
    }
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

    const transcriptText = formatTranscript(transcript);
    const timeRange = transcript.length > 0
        ? `from ${formatTimeHMS(transcript[0].start)} to ${formatTimeHMS(transcript[transcript.length - 1].end)}`
        : "";

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: `${SEGMENTATION_PROMPT}\n\nVideo total duration: ${videoDuration} seconds (${formatTimeHMS(videoDuration)})\nThis transcript chunk covers ${timeRange}.\n\nTranscript:\n${transcriptText}`,
                            },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 8192,
                    responseMimeType: "application/json",
                },
            }),
        }
    );

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini API error: ${response.status} — ${err}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) throw new Error("Empty response from Gemini");

    return parseSegments(content, videoDuration);
}

/**
 * Unified segmentation with chunking for long videos.
 * Splits transcript into ~10-minute windows, processes each independently,
 * then merges and deduplicates results.
 */
export async function segmentVideo(
    transcript: TranscriptSegment[],
    videoDuration: number
): Promise<SegmentSuggestion[]> {
    const CHUNK_DURATION = 600; // 10 minutes in seconds
    const OVERLAP = 120; // 2 minute overlap — ensures stories spanning chunk boundaries are captured

    // For short videos (under 12 min), process in one shot
    if (videoDuration <= CHUNK_DURATION + OVERLAP * 2) {
        return segmentChunk(transcript, videoDuration);
    }

    // Split transcript into chunks
    const chunks: TranscriptSegment[][] = [];
    let chunkStart = 0;

    while (chunkStart < videoDuration) {
        const chunkEnd = Math.min(chunkStart + CHUNK_DURATION, videoDuration);
        // Include all transcript segments that START within this chunk's range (with overlap buffer)
        const chunkSegments = transcript.filter(
            (s) => s.start >= Math.max(0, chunkStart - OVERLAP) && s.start < chunkEnd + OVERLAP
        );

        if (chunkSegments.length > 0) {
            chunks.push(chunkSegments);
            console.log(`[AI] Chunk: ${formatTimeHMS(chunkSegments[0].start)} → ${formatTimeHMS(chunkSegments[chunkSegments.length - 1].end)} (${chunkSegments.length} transcript segments)`);
        }
        chunkStart += CHUNK_DURATION;
    }

    console.log(`[AI] Video is ${formatTimeHMS(videoDuration)} long — splitting into ${chunks.length} chunks`);

    // Process all chunks
    const allSegments: SegmentSuggestion[] = [];

    for (let i = 0; i < chunks.length; i++) {
        console.log(`[AI] Processing chunk ${i + 1}/${chunks.length} (${formatTimeHMS(chunks[i][0].start)} → ${formatTimeHMS(chunks[i][chunks[i].length - 1].end)})`);
        try {
            const chunkResults = await segmentChunk(chunks[i], videoDuration);
            allSegments.push(...chunkResults);
            console.log(`[AI] Chunk ${i + 1}: found ${chunkResults.length} segments`);
        } catch (err: any) {
            console.warn(`[AI] Chunk ${i + 1} failed: ${err.message}`);
        }
    }

    // Deduplicate overlapping segments (from chunk overlap)
    const deduped = deduplicateSegments(allSegments);
    console.log(`[AI] Total: ${deduped.length} unique segments from ${allSegments.length} raw`);

    return deduped.sort((a, b) => a.start - b.start);
}

/**
 * Process a single chunk with DeepSeek → Gemini fallback
 */
async function segmentChunk(
    transcript: TranscriptSegment[],
    videoDuration: number
): Promise<SegmentSuggestion[]> {
    try {
        return await segmentWithDeepSeek(transcript, videoDuration);
    } catch (deepSeekError: any) {
        console.warn("[AI] DeepSeek failed, trying Gemini:", deepSeekError.message);
        return await segmentWithGemini(transcript, videoDuration);
    }
}

/**
 * Remove duplicate/overlapping segments from chunk boundaries
 */
function deduplicateSegments(segments: SegmentSuggestion[]): SegmentSuggestion[] {
    const sorted = segments.sort((a, b) => a.start - b.start);
    const result: SegmentSuggestion[] = [];

    for (const seg of sorted) {
        const dupeIndex = result.findIndex((existing) => {
            const overlapStart = Math.max(existing.start, seg.start);
            const overlapEnd = Math.min(existing.end, seg.end);
            const overlap = Math.max(0, overlapEnd - overlapStart);
            const minDuration = Math.min(existing.end - existing.start, seg.end - seg.start);
            // Consider duplicate if >40% of the shorter segment overlaps
            return overlap > 0 && overlap / minDuration > 0.4;
        });

        if (dupeIndex === -1) {
            result.push(seg);
        } else {
            // Keep the higher-scored version
            if (seg.overallScore > result[dupeIndex].overallScore) {
                result[dupeIndex] = seg;
            }
        }
    }

    return result;
}

// ─── Helpers ──────────────────────────────────────

function formatTranscript(segments: TranscriptSegment[]): string {
    return segments
        .map((s) => `[${formatTimeHMS(s.start)} → ${formatTimeHMS(s.end)}] ${s.text}`)
        .join("\n");
}

function formatTimeHMS(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function parseSegments(
    content: string,
    videoDuration: number
): SegmentSuggestion[] {
    let parsed: any;

    try {
        parsed = JSON.parse(content);
    } catch {
        // Try to extract JSON array from response
        const match = content.match(/\[[\s\S]*\]/);
        if (match) {
            parsed = JSON.parse(match[0]);
        } else {
            throw new Error("Could not parse AI response as JSON");
        }
    }

    // Handle response wrapped in an object
    if (parsed && !Array.isArray(parsed)) {
        if (parsed.segments) parsed = parsed.segments;
        else if (parsed.data) parsed = parsed.data;
        else parsed = Object.values(parsed)[0];
    }

    if (!Array.isArray(parsed)) {
        throw new Error("AI response is not an array");
    }

    // Validate and clamp segments
    return parsed
        .filter((s: any) => {
            const duration = (s.end || 0) - (s.start || 0);
            return duration > 15 && duration <= 65 && s.start >= 0;
        })
        .map((s: any) => ({
            start: Math.max(0, s.start),
            end: Math.min(videoDuration, s.end),
            title: s.title || "Untitled Segment",
            description: s.description || "",
            hookStrength: clamp(s.hookStrength || s.hook_strength || 5, 1, 10),
            emotionalArc: clamp(s.emotionalArc || s.emotional_arc || 5, 1, 10),
            completeness: clamp(s.completeness || 5, 1, 10),
            overallScore: clamp(s.overallScore || s.overall_score || s.score || 5, 1, 10),
        }))
        .sort((a: SegmentSuggestion, b: SegmentSuggestion) => b.overallScore - a.overallScore);
}

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

// Read API key from DB (admin panel saves keys here)
async function getDbApiKey(service: string): Promise<string | null> {
    try {
        const { prisma } = await import("@/lib/prisma");
        const dbKey = await prisma.apiKey.findUnique({ where: { service } });
        if (dbKey?.key) {
            return Buffer.from(dbKey.key, "base64").toString("utf8");
        }
    } catch { }
    return null;
}
