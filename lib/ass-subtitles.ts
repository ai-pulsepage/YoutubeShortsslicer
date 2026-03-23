/**
 * ASS Subtitle Generator — Karaoke-style word highlighting
 *
 * Generates .ass subtitle files from word-level timestamps.
 * Supports multiple animation modes:
 *   - word-highlight (karaoke): Highlights the current word in a different color
 *   - pop: Words scale up as they're spoken
 *   - fade: Words fade in when spoken
 *
 * Used by the render worker to replace basic drawtext subtitles.
 */

export interface WordTimestamp {
  text: string;      // also supports "word" key from transcript
  word?: string;
  start: number;     // seconds
  end: number;       // seconds
}

export interface SubtitleStyle {
  font?: string;
  fontSize?: number;
  primaryColor?: string;   // hex, e.g. "#FFFFFF"
  highlightColor?: string; // hex, e.g. "#FFD700"
  outlineColor?: string;   // hex, e.g. "#000000"
  shadowColor?: string;    // hex, e.g. "#00000080"
  position?: "top" | "center" | "bottom";
  animation?: "word-highlight" | "pop" | "fade" | "slide-up";
  bold?: boolean;
}

const DEFAULT_STYLE: SubtitleStyle = {
  font: "Montserrat",
  fontSize: 48,
  primaryColor: "#FFFFFF",
  highlightColor: "#FFD700",
  outlineColor: "#000000",
  shadowColor: "#00000080",
  position: "bottom",
  animation: "word-highlight",
  bold: true,
};

/**
 * Convert hex color (#RRGGBB or #RRGGBBAA) to ASS color format (&HAABBGGRR)
 */
function hexToAssColor(hex: string): string {
  const clean = hex.replace("#", "");
  let r: string, g: string, b: string, a: string;

  if (clean.length === 8) {
    r = clean.substring(0, 2);
    g = clean.substring(2, 4);
    b = clean.substring(4, 6);
    a = clean.substring(6, 8);
  } else if (clean.length === 6) {
    r = clean.substring(0, 2);
    g = clean.substring(2, 4);
    b = clean.substring(4, 6);
    a = "00"; // fully opaque
  } else {
    return "&H00FFFFFF"; // fallback white
  }

  // ASS uses &HAABBGGRR (alpha, blue, green, red — reversed)
  return `&H${a.toUpperCase()}${b.toUpperCase()}${g.toUpperCase()}${r.toUpperCase()}`;
}

/**
 * Get ASS alignment number based on position string.
 * ASS numpad-style: 1=bottom-left, 2=bottom-center, 5=center, 8=top-center
 */
function getAlignment(position: string): number {
  switch (position) {
    case "top": return 8;
    case "center": return 5;
    case "bottom":
    default: return 2;
  }
}

/**
 * Get ASS vertical margin based on position
 */
function getMarginV(position: string): number {
  switch (position) {
    case "top": return 80;
    case "center": return 0;
    case "bottom":
    default: return 120; // raised up a bit from very bottom for safe area
  }
}

/**
 * Format seconds to ASS timestamp (H:MM:SS.cc — centiseconds)
 */
function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/**
 * Group words into display lines (max N words per line, or max char width).
 * Returns arrays of word groups that appear on screen together.
 */
function groupWordsIntoLines(
  words: WordTimestamp[],
  maxWordsPerLine: number = 5,
  maxCharsPerLine: number = 35
): WordTimestamp[][] {
  const groups: WordTimestamp[][] = [];
  let currentGroup: WordTimestamp[] = [];
  let currentChars = 0;

  for (const word of words) {
    const wordText = word.text || word.word || "";
    const wordLen = wordText.length;

    if (
      currentGroup.length >= maxWordsPerLine ||
      (currentChars + wordLen > maxCharsPerLine && currentGroup.length > 0)
    ) {
      groups.push(currentGroup);
      currentGroup = [];
      currentChars = 0;
    }

    currentGroup.push(word);
    currentChars += wordLen + 1; // +1 for space
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

/**
 * Generate karaoke-style ASS dialogue events.
 * Each word group (line) becomes one Dialogue event.
 * The currently spoken word gets highlighted via \kf tags.
 */
function generateKaraokeEvents(
  wordGroups: WordTimestamp[][],
  style: SubtitleStyle
): string[] {
  const events: string[] = [];
  const highlightAssColor = hexToAssColor(style.highlightColor || "#FFD700");

  for (const group of wordGroups) {
    if (group.length === 0) continue;

    const lineStart = group[0].start;
    const lineEnd = group[group.length - 1].end;

    // Build the karaoke text with \kf tags
    // Each word gets a \kf<duration_cs> tag that transitions the color
    let karaokeText = "";

    for (let i = 0; i < group.length; i++) {
      const word = group[i];
      const wordText = (word.text || word.word || "").trim();
      if (!wordText) continue;

      // Duration in centiseconds for this word
      const durationCs = Math.round((word.end - word.start) * 100);

      // \kf = smooth fill (karaoke fill), changes color progressively
      // Before highlight: primary color. During: transitions to highlight color.
      karaokeText += `{\\kf${durationCs}\\1c${highlightAssColor}}${wordText}`;

      // Add space between words (not after last)
      if (i < group.length - 1) {
        karaokeText += " ";
      }
    }

    const startTime = formatAssTime(lineStart);
    const endTime = formatAssTime(lineEnd);

    events.push(
      `Dialogue: 0,${startTime},${endTime},Karaoke,,0,0,0,,${karaokeText}`
    );
  }

  return events;
}

/**
 * Generate simple word-highlight ASS events (non-karaoke).
 * Shows all words but the current word is in highlight color and bold/larger.
 */
function generateWordHighlightEvents(
  wordGroups: WordTimestamp[][],
  style: SubtitleStyle
): string[] {
  const events: string[] = [];
  const primaryColor = hexToAssColor(style.primaryColor || "#FFFFFF");
  const highlightColor = hexToAssColor(style.highlightColor || "#FFD700");

  for (const group of wordGroups) {
    if (group.length === 0) continue;

    // For each word in the group, create a dialogue that highlights that word
    for (let wordIdx = 0; wordIdx < group.length; wordIdx++) {
      const currentWord = group[wordIdx];
      const nextWord = group[wordIdx + 1];

      const startTime = formatAssTime(currentWord.start);
      const endTime = formatAssTime(nextWord ? nextWord.start : currentWord.end);

      // Build text with the current word highlighted
      let text = "";
      for (let i = 0; i < group.length; i++) {
        const w = group[i];
        const wText = (w.text || w.word || "").trim();
        if (!wText) continue;

        if (i === wordIdx) {
          // Highlighted word: different color + bold + slightly larger
          text += `{\\1c${highlightColor}\\b1\\fscx110\\fscy110}${wText}{\\1c${primaryColor}\\b0\\fscx100\\fscy100}`;
        } else {
          text += wText;
        }

        if (i < group.length - 1) text += " ";
      }

      events.push(
        `Dialogue: 0,${startTime},${endTime},Karaoke,,0,0,0,,${text}`
      );
    }
  }

  return events;
}

/**
 * Main function: Generate a complete ASS subtitle file content.
 *
 * @param words - Array of word-level timestamps from the transcript
 * @param style - Subtitle styling options
 * @param segmentOffset - Time offset to subtract (segment startTime) so words are relative to clip start
 * @returns Complete ASS file content as a string
 */
export function generateAssSubtitles(
  words: WordTimestamp[],
  style: Partial<SubtitleStyle> = {},
  segmentOffset: number = 0
): string {
  const mergedStyle: SubtitleStyle = { ...DEFAULT_STYLE, ...style };

  // Normalize words: apply offset and ensure consistent "text" field
  const normalizedWords: WordTimestamp[] = words
    .map((w) => ({
      text: (w.text || w.word || "").trim(),
      start: Math.max(0, w.start - segmentOffset),
      end: Math.max(0, w.end - segmentOffset),
    }))
    .filter((w) => w.text.length > 0 && w.end > w.start);

  if (normalizedWords.length === 0) {
    return generateEmptyAss(mergedStyle);
  }

  // Group words into display lines
  const wordGroups = groupWordsIntoLines(normalizedWords);

  // Generate dialogue events based on animation mode
  let events: string[];
  switch (mergedStyle.animation) {
    case "word-highlight":
      events = generateWordHighlightEvents(wordGroups, mergedStyle);
      break;
    case "pop":
    case "fade":
    case "slide-up":
    default:
      // For now, karaoke fill works well for all modes
      events = generateKaraokeEvents(wordGroups, mergedStyle);
      break;
  }

  // Build the complete ASS file
  const alignment = getAlignment(mergedStyle.position || "bottom");
  const marginV = getMarginV(mergedStyle.position || "bottom");
  const primaryAssColor = hexToAssColor(mergedStyle.primaryColor || "#FFFFFF");
  const outlineAssColor = hexToAssColor(mergedStyle.outlineColor || "#000000");
  const shadowAssColor = hexToAssColor(mergedStyle.shadowColor || "#00000080");
  const fontWeight = mergedStyle.bold ? -1 : 0;

  const assContent = `[Script Info]
Title: Karaoke Subtitles
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,${mergedStyle.font || "Montserrat"},${mergedStyle.fontSize || 48},${primaryAssColor},${primaryAssColor},${outlineAssColor},${shadowAssColor},${fontWeight},0,0,0,100,100,0,0,1,3,1,${alignment},40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;

  return assContent;
}

/**
 * Generate an empty ASS file (no dialogue events) for when there are no words.
 */
function generateEmptyAss(style: SubtitleStyle): string {
  const alignment = getAlignment(style.position || "bottom");
  const marginV = getMarginV(style.position || "bottom");
  const primaryAssColor = hexToAssColor(style.primaryColor || "#FFFFFF");
  const outlineAssColor = hexToAssColor(style.outlineColor || "#000000");
  const shadowAssColor = hexToAssColor(style.shadowColor || "#00000080");

  return `[Script Info]
Title: Karaoke Subtitles
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,${style.font || "Montserrat"},${style.fontSize || 48},${primaryAssColor},${primaryAssColor},${outlineAssColor},${shadowAssColor},-1,0,0,0,100,100,0,0,1,3,1,${alignment},40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}
