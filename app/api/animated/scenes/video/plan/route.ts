import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { lyrics, numShots, characters, shotDuration, visualStyle } = await req.json();
    if (!lyrics || !numShots) {
        return NextResponse.json({ error: "lyrics and numShots are required" }, { status: 400 });
    }

    try {
        let apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            const dbKey = await prisma.apiKey.findUnique({ where: { service: "deepseek_api_key" } });
            if (dbKey?.key) apiKey = Buffer.from(dbKey.key, "base64").toString("utf8");
        }

        const characterNames = (characters && Array.isArray(characters) && characters.length > 0)
            ? characters.map((c: any) => c.name).join(", ")
            : "Narrator, Leo, Lily";

        if (!apiKey) {
            return NextResponse.json(
                { error: "DEEPSEEK_KEY_MISSING", details: "DeepSeek API key is not configured. Please add it in Settings." },
                { status: 503 }
            );
        }

        const selectedStyle = visualStyle || "Pixar 3D";
        const clipDuration = shotDuration || 5;

        const systemPrompt = `You are a professional kids TV storyboard director. Break down the provided song lyrics/text into EXACTLY ${numShots} consecutive visual shots. Each shot represents a ${clipDuration}-second video clip.

CRITICAL RULES:
1. You MUST generate exactly ${numShots} shots. No more, no less.
2. For each shot, assign the "primaryCharacter" from the following cast list: ${characterNames}. Choose the character who is the main subject of that shot.
3. DIRECTOR'S BRIEF: The video generator reads ONLY this shot card — it has zero memory of any other shot. Every "visualPrompt" must be completely self-contained and include:
   - Style prefix: "${selectedStyle} style animation of..."
   - Character name + brief physical description (e.g. "Leo, a cheerful brown bear cub with a red scarf")
   - A specific, dynamic action that naturally fills ${clipDuration} seconds of motion (e.g. not "standing" but "slowly turning around looking up in wonder" or "running across a meadow, arms pumping")
   - Camera angle/movement if relevant (e.g. "close-up", "wide shot", "slow pan left")
   - Setting/background context
4. CHAINING: Decide whether each shot flows continuously from the previous shot's last frame (chainFromPrevious: true) or starts fresh with a hard cut to a new location/angle (chainFromPrevious: false). Shot index 1 is ALWAYS chainFromPrevious: false. Use chaining when the same character is continuing an uninterrupted action across shots. Use false when there is a location change, time jump, or new character entering.

Return ONLY a valid JSON array of shots without any markdown wrapping or preamble.
JSON Schema:
[
  {
    "index": number, // 1-indexed
    "primaryCharacter": "One of: ${characterNames}",
    "visualPrompt": "Full director's shot brief as described above.",
    "chainFromPrevious": boolean
  }
]`;

        const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: lyrics
                    }
                ],
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            if (res.status === 402 || errText.toLowerCase().includes("insufficient_balance") || errText.toLowerCase().includes("balance") || errText.toLowerCase().includes("credit")) {
                return NextResponse.json({ error: "DEEPSEEK_OUT_OF_FUNDS", details: "DeepSeek API: Insufficient Balance. Please check your funds at console.deepseek.com." }, { status: 402 });
            }
            throw new Error(`DeepSeek API returned ${res.status}: ${errText}`);
        }

        const data = await res.json();
        let content = data.choices?.[0]?.message?.content?.trim() || "";

        if (content.startsWith("```")) {
            content = content.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
        }

        try {
            const shots = JSON.parse(content);
            return NextResponse.json({ shots: Array.isArray(shots) ? shots : [shots] });
        } catch (parseErr: any) {
            console.error("[Storyboard Plan] Failed to parse AI shot plan JSON:", parseErr.message);
            return NextResponse.json(
                { error: "AI_RESPONSE_PARSE_ERROR", details: "The AI returned a malformed shot plan. Please try planning the shots again." },
                { status: 500 }
            );
        }

    } catch (err: any) {
        console.error("[Storyboard Plan] Error:", err.message);
        return NextResponse.json({ error: "Failed to plan storyboard", details: err.message }, { status: 500 });
    }
}
