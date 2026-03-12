/**
 * JSON Repair Utility
 *
 * Robust parser for LLM-generated JSON that handles common quirks:
 *   - Markdown code fences (```json ... ```)
 *   - Smart/curly quotes (" " ' ')
 *   - Unescaped control characters inside strings
 *   - Trailing commas before } and ]
 *   - Truncated output (unclosed brackets/braces)
 *   - Non-breaking spaces and zero-width characters
 *
 * Used by both story-writer.ts and scene-planner.ts.
 */

/**
 * Attempts to parse JSON with progressively aggressive repair strategies.
 * Throws with detailed context if all repairs fail.
 */
export function repairAndParseJSON<T = any>(raw: string): T {
    // ── Pass 1: Try raw parse first ────────────────────────
    try { return JSON.parse(raw); } catch { /* continue */ }

    let cleaned = raw;

    // ── Pass 2: Strip markdown fences ──────────────────────
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

    // ── Pass 3: Replace smart/curly quotes ──────────────────
    cleaned = cleaned
        .replace(/[\u201C\u201D]/g, '"')   // " " → "
        .replace(/[\u2018\u2019]/g, "'");  // ' ' → '

    // ── Pass 4: Remove zero-width / BOM / non-breaking chars ─
    cleaned = cleaned
        .replace(/[\uFEFF\u200B\u200C\u200D\u00A0]/g, " ")
        .trim();

    // ── Pass 5: Escape unescaped control chars inside strings ─
    cleaned = escapeControlCharsInStrings(cleaned);

    // ── Pass 6: Remove trailing commas ────────────────────
    cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");

    // Try parsing after sanitisation
    try { return JSON.parse(cleaned); } catch { /* continue */ }

    // ── Pass 7: Close unclosed structures (truncation repair) ─
    cleaned = closeTruncatedJSON(cleaned);

    try { return JSON.parse(cleaned); } catch { /* continue */ }

    // ── Pass 8: Nuclear — extract first valid JSON object ────
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
        let candidate = objMatch[0];
        candidate = candidate.replace(/,\s*([}\]])/g, "$1");
        candidate = closeTruncatedJSON(candidate);
        try { return JSON.parse(candidate); } catch { /* continue */ }
    }

    // ── All repairs failed — throw with context ──────────
    const errorRegion = raw.substring(
        Math.max(0, 2424 - 80),
        Math.min(raw.length, 2424 + 80)
    );
    console.error(
        `[JSONRepair] All repair strategies failed.\n` +
        `  Length: ${raw.length} chars\n` +
        `  Region around pos 2424: ...${errorRegion}...`
    );
    console.error(`[JSONRepair] First 500 chars: ${raw.slice(0, 500)}`);

    // Rethrow the original parse error for the caller
    return JSON.parse(cleaned); // will throw
}

/**
 * Escape literal control characters (\n, \t, \r, etc.) that appear
 * unescaped inside JSON string values.
 */
function escapeControlCharsInStrings(json: string): string {
    const result: string[] = [];
    let inString = false;
    let i = 0;

    while (i < json.length) {
        const ch = json[i];

        if (ch === '"' && (i === 0 || json[i - 1] !== "\\")) {
            inString = !inString;
            result.push(ch);
            i++;
            continue;
        }

        if (inString) {
            const code = json.charCodeAt(i);
            if (code < 0x20) {
                // Control character inside a string — escape it
                switch (code) {
                    case 0x0A: result.push("\\n"); break;   // newline
                    case 0x0D: result.push("\\r"); break;   // carriage return
                    case 0x09: result.push("\\t"); break;   // tab
                    case 0x08: result.push("\\b"); break;   // backspace
                    case 0x0C: result.push("\\f"); break;   // form feed
                    default:   result.push(" ");   break;   // other control → space
                }
                i++;
                continue;
            }
        }

        result.push(ch);
        i++;
    }

    return result.join("");
}

/**
 * Close any unclosed brackets and braces in truncated JSON.
 */
function closeTruncatedJSON(json: string): string {
    let braces = 0;
    let brackets = 0;
    let inString = false;

    for (let i = 0; i < json.length; i++) {
        const ch = json[i];
        if (ch === '"' && (i === 0 || json[i - 1] !== "\\")) {
            inString = !inString;
            continue;
        }
        if (inString) continue;

        if (ch === "{") braces++;
        if (ch === "}") braces--;
        if (ch === "[") brackets++;
        if (ch === "]") brackets--;
    }

    // Remove any trailing partial entry after the last complete close
    let result = json.replace(/,\s*$/, "");

    for (let i = 0; i < brackets; i++) result += "]";
    for (let i = 0; i < braces; i++) result += "}";

    return result;
}
