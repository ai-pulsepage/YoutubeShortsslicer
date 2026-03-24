/**
 * ASS Subtitle Generator
 * Converts Whisper word-level timestamps into ASS (Advanced SubStation Alpha) format
 * for FFmpeg subtitle burning with styled text.
 */

export interface SubtitleStyle {
    font: string;
    fontSize: number;
    color: string;         // hex like #FFFFFF
    outline: string;       // hex like #000000
    shadow: string;        // hex like #00000080
    position: "top" | "center" | "bottom";
    animation: string;     // word-highlight, fade, pop, slide-up, typewriter
}

export interface WordTimestamp {
    word: string;
    start: number;  // seconds
    end: number;    // seconds
}

const DEFAULT_STYLE: SubtitleStyle = {
    font: "Montserrat",
    fontSize: 28,
    color: "#FFFFFF",
    outline: "#000000",
    shadow: "#00000080",
    position: "bottom",
    animation: "word-highlight",
};

/**
 * Convert hex color (#RRGGBB or #RRGGBBAA) to ASS format (&HAABBGGRR)
 */
function hexToASS(hex: string): string {
    const clean = hex.replace("#", "");
    let r: string, g: string, b: string, a = "00";

    if (clean.length === 8) {
        r = clean.substring(0, 2);
        g = clean.substring(2, 4);
        b = clean.substring(4, 6);
        a = clean.substring(6, 8);
    } else {
        r = clean.substring(0, 2);
        g = clean.substring(2, 4);
        b = clean.substring(4, 6);
    }

    return `&H${a}${b}${g}${r}`.toUpperCase();
}

/**
 * Convert seconds to ASS timestamp format (H:MM:SS.CC)
 */
function toASSTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.floor((seconds % 1) * 100);
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

/**
 * Group words into subtitle lines (max ~6 words per line for readability)
 */
function groupWordsIntoLines(
    words: WordTimestamp[],
    maxWordsPerLine: number = 5
): { text: string; start: number; end: number; words: WordTimestamp[] }[] {
    const lines: { text: string; start: number; end: number; words: WordTimestamp[] }[] = [];

    for (let i = 0; i < words.length; i += maxWordsPerLine) {
        const chunk = words.slice(i, i + maxWordsPerLine);
        if (chunk.length === 0) continue;

        lines.push({
            text: chunk.map((w) => w.word).join(" "),
            start: chunk[0].start,
            end: chunk[chunk.length - 1].end,
            words: chunk,
        });
    }

    return lines;
}

/**
 * Generate word-highlight effect: current word is colored differently
 */
function generateWordHighlightDialogue(
    line: { text: string; start: number; end: number; words: WordTimestamp[] },
    highlightColor: string,
    segmentOffset: number
): string[] {
    const events: string[] = [];

    // Show the word group with each word highlighted in turn\r\n    if (line.words.length === 0 || line.words[0].start - segmentOffset < 0) return events;

    for (let wi = 0; wi < line.words.length; wi++) {
        const w = line.words[wi];
        const wStart = w.start - segmentOffset;
        const wEnd = w.end - segmentOffset;
        if (wStart < 0) continue;

        // Build line: only the current word is highlighted yellow
        const parts = line.words.map((word, idx) => {
            if (idx === wi) {
                return `{\\c${highlightColor}}${word.word}{\\c&H00FFFFFF&}`;
            }
            return word.word;
        });

        events.push(
            `Dialogue: 0,${toASSTime(wStart)},${toASSTime(wEnd)},Default,,0,0,0,,${parts.join(" ")}`
        );
    }

    return events;
}

/**
 * Generate ASS subtitle file content
 */
export function generateASS(
    words: WordTimestamp[],
    segmentStart: number,
    segmentEnd: number,
    style: Partial<SubtitleStyle> = {}
): string {
    const s = { ...DEFAULT_STYLE, ...style };

    // Filter words to this segment's time range
    const segmentWords = words.filter(
        (w) => w.start >= segmentStart - 0.5 && w.end <= segmentEnd + 0.5
    );

    if (segmentWords.length === 0) {
        return ""; // No words for this segment
    }

    // Position: alignment + margin
    let alignment = 2; // bottom center
    let marginV = 300;  // 300px from bottom on 1920px canvas
    if (s.position === "top") {
        alignment = 8; // top center
        marginV = 120;  // 120px from top (below hook text area)
    } else if (s.position === "center") {
        alignment = 5; // middle center
        marginV = 0;
    }

    // ASS colors
    const primaryColor = hexToASS(s.color);
    const outlineColor = hexToASS(s.outline);
    const shadowColor = s.shadow ? hexToASS(s.shadow) : "&H80000000";

    // Use fontSize as-is — already sized for 1080x1920 canvas
    const fontSize = s.fontSize;

    const header = `[Script Info]
Title: Subtitle
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${s.font},${fontSize},${primaryColor},&H000000FF,${outlineColor},${shadowColor},1,0,0,0,100,100,0,0,1,3,1,${alignment},40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

    // Dynamic words per line based on font size: larger = fewer words
    const maxWords = fontSize >= 56 ? 3 : fontSize >= 40 ? 4 : 5;
    const lines = groupWordsIntoLines(segmentWords, maxWords);
    const events: string[] = [];

    const highlightColor = "&H0000FFFF"; // Yellow highlight for word-by-word

    if (s.animation === "word-highlight") {
        // Word-by-word highlight: each word lights up as it's spoken
        for (const line of lines) {
            events.push(
                ...generateWordHighlightDialogue(line, highlightColor, segmentStart)
            );
        }
    } else {
        // Simple display: show full line for its duration
        for (const line of lines) {
            const start = line.start - segmentStart;
            const end = line.end - segmentStart;
            if (start < 0) continue;

            let effect = "";
            if (s.animation === "fade") {
                effect = `{\\fad(200,200)}`;
            } else if (s.animation === "pop") {
                effect = `{\\fscx0\\fscy0\\t(0,150,\\fscx100\\fscy100)}`;
            } else if (s.animation === "slide-up") {
                const startY = marginV + 50;
                effect = `{\\move(540,${startY + 900},540,${marginV + 900},0,200)}`;
            }

            events.push(
                `Dialogue: 0,${toASSTime(start)},${toASSTime(end)},Default,,0,0,0,,${effect}${line.text}`
            );
        }
    }

    return `${header}\n${events.join("\n")}\n`;
}
