/**
 * ASS Subtitle Generator
 * Converts Whisper word-level timestamps into ASS (Advanced SubStation Alpha) format
 * for FFmpeg subtitle burning with styled text.
 *
 * IMPORTANT: fontSize values are in REAL pixels for a 1080x1920 PlayRes canvas.
 * There are NO hidden multipliers. What the UI sends = what renders.
 * Recommended range: 48–120px. Default: 80px.
 */

export interface SubtitleStyle {
    font: string;
    fontSize: number;       // Real pixels for 1080x1920 canvas (no scaling)
    color: string;          // hex like #FFFFFF
    outline: string;        // hex like #000000
    shadow: string;         // hex like #00000080
    position: "top" | "center" | "bottom";
    animation: string;      // word-highlight, fade, pop, slide-up
    highlightColor?: string; // hex like #00CCFF for karaoke active word
}

export interface WordTimestamp {
    word: string;
    start: number;  // seconds
    end: number;    // seconds
}

const DEFAULT_STYLE: SubtitleStyle = {
    font: "Montserrat",
    fontSize: 80,           // 80px on 1080x1920 = clearly readable
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

interface LineGroup {
    text: string;
    start: number;
    end: number;
    words: WordTimestamp[];
}

/**
 * Group words into lines using CHARACTER WIDTH estimation.
 * Guarantees text fits within maxWidth pixels at the given fontSize.
 * Also caps at maxWordsPerGroup for karaoke pacing (short bursts).
 */
function groupWordsByWidth(
    words: WordTimestamp[],
    fontSize: number,
    maxWidth: number = 840,      // 1080 - 120px margin per side
    maxWordsPerGroup: number = 3
): LineGroup[] {
    const charWidth = fontSize * 0.65; // conservative avg char width (bold + outline)
    const lines: LineGroup[] = [];
    let current: WordTimestamp[] = [];
    let currentWidth = 0;

    for (const w of words) {
        const wordWidth = w.word.length * charWidth + charWidth; // +space
        const wouldOverflow = current.length > 0 && (currentWidth + wordWidth > maxWidth);
        const wouldExceedMax = current.length >= maxWordsPerGroup;

        if (wouldOverflow || wouldExceedMax) {
            if (current.length > 0) {
                lines.push({
                    text: current.map((cw) => cw.word).join(" "),
                    start: current[0].start,
                    end: current[current.length - 1].end,
                    words: current,
                });
            }
            current = [w];
            currentWidth = wordWidth;
        } else {
            current.push(w);
            currentWidth += wordWidth;
        }
    }

    if (current.length > 0) {
        lines.push({
            text: current.map((cw) => cw.word).join(" "),
            start: current[0].start,
            end: current[current.length - 1].end,
            words: current,
        });
    }

    return lines;
}

/**
 * Generate word-highlight (karaoke) effect:
 * Shows the word group, with the current word highlighted in color.
 */
function generateWordHighlightDialogue(
    line: LineGroup,
    highlightColor: string,
    segmentOffset: number
): string[] {
    const events: string[] = [];

    if (line.words.length === 0) return events;

    for (let wi = 0; wi < line.words.length; wi++) {
        const w = line.words[wi];
        const wStart = w.start - segmentOffset;
        const wEnd = w.end - segmentOffset;
        if (wStart < 0) continue;

        // Build line: current word highlighted, others in default color
        const parts = line.words.map((word, idx) => {
            if (idx === wi) {
                return `{\\c${highlightColor}&}${word.word}{\\c&H00FFFFFF&}`;
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
 * Generate ASS subtitle file content.
 * fontSize is used AS-IS — no hidden multipliers.
 */
export function generateASS(
    words: WordTimestamp[],
    segmentStart: number,
    segmentEnd: number,
    style: Partial<SubtitleStyle> = {}
): string {
    const s = { ...DEFAULT_STYLE, ...style };
    const fontSize = s.fontSize; // Direct — no scaling

    console.log(`[ASS] Generating: fontSize=${fontSize}, font=${s.font}, position=${s.position}, animation=${s.animation}`);

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
        marginV = 200;  // 200px from top
    } else if (s.position === "center") {
        alignment = 5; // middle center
        marginV = 0;
    }

    // ASS colors
    const primaryColor = hexToASS(s.color);
    const outlineColor = hexToASS(s.outline);
    const shadowColor = s.shadow ? hexToASS(s.shadow) : "&H80000000";

    const header = `[Script Info]
Title: Subtitle
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${s.font},${fontSize},${primaryColor},&H000000FF,${outlineColor},${shadowColor},1,0,0,0,100,100,0,0,1,7,2,${alignment},120,120,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

    // Adaptive word grouping: fewer words at larger sizes for karaoke pacing
    const maxWords = fontSize >= 96 ? 2 : 3;
    const lines = groupWordsByWidth(segmentWords, fontSize, 840, maxWords);
    const charW = fontSize * 0.65;
    for (let i = 0; i < lines.length; i++) {
        const estWidth = Math.round(lines[i].text.length * charW);
        console.log(`[ASS] Group ${i+1}/${lines.length}: "${lines[i].text}" (${lines[i].words.length} words, ~${estWidth}px)`);
    }
    console.log(`[ASS] ${segmentWords.length} words → ${lines.length} groups (fontSize=${fontSize})`);
    const events: string[] = [];

    const highlightColor = s.highlightColor ? hexToASS(s.highlightColor) : "&H00FFCC00"; // Default cyan-blue

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
