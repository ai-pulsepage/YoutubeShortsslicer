/**
 * Test script to verify ASS subtitle output.
 * Run: npx tsx /tmp/test_ass.ts
 */
import { generateASS } from "./lib/subtitles";

// Simulate word timestamps from Whisper (a typical sentence)
const words = [
    { word: "They", start: 5.0, end: 5.3 },
    { word: "used", start: 5.3, end: 5.5 },
    { word: "to", start: 5.5, end: 5.6 },
    { word: "get", start: 5.6, end: 5.8 },
    { word: "in", start: 5.8, end: 5.9 },
    { word: "these", start: 5.9, end: 6.1 },
    { word: "giant", start: 6.1, end: 6.4 },
    { word: "bubble", start: 6.4, end: 6.7 },
    { word: "fights", start: 6.7, end: 7.0 },
    { word: "and", start: 7.0, end: 7.1 },
    { word: "it", start: 7.1, end: 7.2 },
    { word: "was", start: 7.2, end: 7.4 },
    { word: "absolutely", start: 7.4, end: 7.9 },
    { word: "insane", start: 7.9, end: 8.3 },
];

// Test at different font sizes
for (const fontSize of [64, 80, 96, 120]) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`FONT SIZE: ${fontSize}px`);
    console.log(`${"=".repeat(60)}`);

    const ass = generateASS(words, 4.5, 9.0, {
        font: "Montserrat",
        fontSize,
        color: "#FFFFFF",
        outline: "#000000",
        position: "bottom",
        animation: "word-highlight",
        highlightColor: "#00CCFF",
    });

    console.log(ass);
    
    // Count dialogue lines
    const dialogueLines = ass.split("\n").filter(l => l.startsWith("Dialogue:"));
    console.log(`\nTotal dialogue events: ${dialogueLines.length}`);
    
    // Check for any line that might be too wide
    const charWidth = fontSize * 0.55;
    for (const dl of dialogueLines) {
        // Extract the visible text (strip ASS tags)
        const textPart = dl.split(",,").pop() || "";
        const cleaned = textPart.replace(/\{[^}]+\}/g, "");
        const estimatedWidth = cleaned.length * charWidth;
        if (estimatedWidth > 900) {
            console.log(`⚠️ OVERFLOW: "${cleaned}" (est. ${Math.round(estimatedWidth)}px > 900px)`);
        }
    }
}
