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

const SEGMENTATION_PROMPT = `You are a viral short-form content expert. Analyze this video transcript and identify the BEST segments that would make compelling YouTube Shorts (under 60 seconds each).

For each segment, look for:
1. **Self-contained narrative arcs** — mini-stories with a beginning, middle, and end
2. **Escalation moments** — tension building to a climax or reveal
3. **Emotional hooks** — surprising, funny, shocking, or deeply engaging moments
4. **Topic shifts** — natural breakpoints where a new compelling topic begins

CRITICAL RULES:
- Each segment MUST be under 60 seconds
- Each segment should be 15-58 seconds (sweet spot: 30-50s)
- Segments must start and end at natural speech boundaries
- Never cut mid-sentence or mid-thought
- Prefer segments with strong opening hooks (first 3 seconds matter most)

Score each segment 1-10 on:
- hookStrength: How attention-grabbing is the first 3 seconds?
- emotionalArc: Does it have a satisfying emotional journey?
- completeness: Is it a self-contained piece that makes sense alone?

Respond ONLY with valid JSON array. No markdown, no explanation:
[
  {
    "start": 0.0,
    "end": 45.5,
    "title": "Short descriptive title",
    "description": "Why this segment is compelling",
    "hookStrength": 8,
    "emotionalArc": 7,
    "completeness": 9,
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
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const apiBase = process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com";

    if (!apiKey) throw new Error("DEEPSEEK_API_KEY not configured");

    const transcriptText = formatTranscript(transcript);

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
                    content: `Video duration: ${videoDuration} seconds\n\nTranscript:\n${transcriptText}`,
                },
            ],
            temperature: 0.3,
            max_tokens: 4096,
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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

    const transcriptText = formatTranscript(transcript);

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
                                text: `${SEGMENTATION_PROMPT}\n\nVideo duration: ${videoDuration} seconds\n\nTranscript:\n${transcriptText}`,
                            },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 4096,
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
 * Unified segmentation: try DeepSeek, fallback to Gemini
 */
export async function segmentVideo(
    transcript: TranscriptSegment[],
    videoDuration: number
): Promise<SegmentSuggestion[]> {
    try {
        console.log("[AI] Attempting segmentation with DeepSeek V3.2...");
        return await segmentWithDeepSeek(transcript, videoDuration);
    } catch (deepSeekError: any) {
        console.warn("[AI] DeepSeek failed, falling back to Gemini:", deepSeekError.message);
        try {
            return await segmentWithGemini(transcript, videoDuration);
        } catch (geminiError: any) {
            console.error("[AI] Both providers failed:", geminiError.message);
            throw new Error(
                `Segmentation failed. DeepSeek: ${deepSeekError.message}. Gemini: ${geminiError.message}`
            );
        }
    }
}

// ─── Helpers ──────────────────────────────────────

function formatTranscript(segments: TranscriptSegment[]): string {
    return segments
        .map((s) => `[${formatTime(s.start)} → ${formatTime(s.end)}] ${s.text}`)
        .join("\n");
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
            return duration > 5 && duration <= 60 && s.start >= 0 && s.end <= videoDuration;
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
