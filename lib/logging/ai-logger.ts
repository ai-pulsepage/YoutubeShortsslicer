import fs from "fs";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "public", "logs");
const LOG_FILE = path.join(LOG_DIR, "ai_generation.log");

export function logAiActivity(type: string, data: {
    promptTitle?: string;
    systemPrompt?: string;
    userPrompt?: string;
    rawResponse?: string;
    error?: string;
    repaired?: boolean;
}) {
    try {
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true });
        }

        const timestamp = new Date().toISOString();
        const divider = "================================================================================";
        let entry = `\n${divider}\n[${timestamp}] AI LOG EVENT: ${type.toUpperCase()}\n${divider}\n`;

        if (data.promptTitle) entry += `TITLE: ${data.promptTitle}\n`;
        if (data.systemPrompt) entry += `--- SYSTEM PROMPT ---\n${data.systemPrompt}\n\n`;
        if (data.userPrompt) entry += `--- USER PROMPT ---\n${data.userPrompt}\n\n`;
        if (data.rawResponse) entry += `--- RAW AI RESPONSE ---\n${data.rawResponse}\n\n`;
        if (data.repaired) entry += `⚠️ JSON Parser note: Truncated response detected and automatically repaired.\n\n`;
        if (data.error) entry += `❌ ERROR: ${data.error}\n\n`;

        fs.appendFileSync(LOG_FILE, entry, "utf8");
    } catch (err) {
        console.error("[AI Logger] Failed to write log:", err);
    }
}

export function getAiLogContent(): string {
    try {
        if (fs.existsSync(LOG_FILE)) {
            return fs.readFileSync(LOG_FILE, "utf8");
        }
    } catch {}
    return "No AI logs recorded yet.";
}
