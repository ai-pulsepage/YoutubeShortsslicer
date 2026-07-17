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

        const anchoredCharacters = (characters && Array.isArray(characters))
            ? characters.filter((c: any) => c.prompt && c.prompt.trim().length > 0)
            : [];
        const freeCharacters = (characters && Array.isArray(characters))
            ? characters.filter((c: any) => !c.prompt || c.prompt.trim().length === 0)
            : [];

        const allCharacterNames = (characters && Array.isArray(characters) && characters.length > 0)
            ? characters.map((c: any) => c.name).join(", ")
            : "Narrator, Leo, Lily";

        const anchoredRoster = anchoredCharacters.length > 0
            ? anchoredCharacters.map((c: any) => `- ${c.name}: ${c.prompt.trim()}`).join("\n")
            : "";

        const freeRoster = freeCharacters.length > 0
            ? freeCharacters.map((c: any) => `- ${c.name}: invent a specific, vivid physical description on first use and repeat it exactly in every shot — never vary it.`).join("\n")
            : "";

        if (!apiKey) {
            return NextResponse.json(
                { error: "DEEPSEEK_KEY_MISSING", details: "DeepSeek API key is not configured. Please add it in Settings." },
                { status: 503 }
            );
        }

        const selectedStyle = visualStyle || "Pixar 3D";
        const clipDuration = shotDuration || 5;

        const STYLE_PROMPT_PREFIX: Record<string, string> = {
            "Pixar 3D": "Pixar-style 3D CGI animation, vibrant colors, expressive character faces, smooth subsurface skin shading, cinematic lighting,",
            "Studio Ghibli": "Studio Ghibli hand-painted anime style, soft impressionistic backgrounds, delicate linework, warm natural lighting, Hayao Miyazaki aesthetic,",
            "Classic Anime": "classic cel-shaded anime, bold clean outlines, flat vibrant colors, expressive eyes, dynamic pose, 90s anime aesthetic,",
            "Claymation": "Aardman Animations claymation stop-motion style, textured clay surfaces, fingerprint-visible handcrafted look, warm soft studio lighting,",
            "Hand-Drawn / Watercolor": "hand-drawn watercolor storybook illustration, soft paint washes, visible brushstroke texture, delicate ink outlines, warm pastel palette,",
            "Retro Cartoon (90s)": "90s Saturday morning retro cartoon style, thick bold black outlines, flat bright colors, energetic squash-and-stretch animation,",
            "Realistic CGI": "photorealistic CGI animation, high-fidelity surface textures, ray-traced global illumination, detailed environment rendering,",
        };
        const stylePrefix = STYLE_PROMPT_PREFIX[selectedStyle] || `${selectedStyle} style animation,`;

        const systemPrompt = `You are a professional kids TV storyboard director. Break down the provided song lyrics/text into EXACTLY ${numShots} consecutive visual shots. Each shot represents a ${clipDuration}-second video clip.

CRITICAL RULES:
1. You MUST generate exactly ${numShots} shots. No more, no less.
2. For each shot, assign the "primaryCharacter" from the following cast ONLY: ${allCharacterNames}. Never assign a character not in this list.
3. DIRECTOR'S BRIEF: Every shot contains two prompt components to separate composition from motion:
   - "imagePrompt": Describes the static starting canvas (background, setting, layout, lighting, character physical description from roster, and starting pose). It MUST start with the style prefix: "${stylePrefix}" followed by the details.
   - "motionPrompt": Describes ONLY the motion, action, and camera movement that occurs during the ${clipDuration} seconds (e.g. "Lily yawns and points to the right as the camera slowly pans left"). DO NOT repeat style or character physical descriptions here.
   - "visualPrompt": A copy of "imagePrompt" (for backwards compatibility).
4. CHAINING: Decide whether each shot flows continuously from the previous shot's last frame (chainFromPrevious: true) or starts fresh with a hard cut (chainFromPrevious: false). Shot index 1 is ALWAYS chainFromPrevious: false.

CHARACTER ROSTER — use these exact descriptions in every imagePrompt:
ANCHORED (use verbatim, do not alter):
${anchoredRoster || "(none)"}

FREE (invent once on first appearance, then repeat exactly):
${freeRoster || "(none)"}

Return ONLY a valid JSON array of shots without any markdown wrapping, preamble, or comments.
Do NOT include trailing commas. Do NOT write comments in the JSON.
JSON Schema:
[
  {
    "index": number,
    "primaryCharacter": "One of: ${allCharacterNames}",
    "imagePrompt": "Detailed visual description starting with style prefix.",
    "motionPrompt": "Focussed motion/action description.",
    "visualPrompt": "Copy of imagePrompt.",
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
                max_tokens: 4000
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

        // Bulletproof JSON block extractor: search for the first '[' and last ']'
        let jsonContent = content.trim();
        const firstBracket = jsonContent.indexOf("[");
        const lastBracket = jsonContent.lastIndexOf("]");
        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
            jsonContent = jsonContent.slice(firstBracket, lastBracket + 1);
        } else if (jsonContent.startsWith("```")) {
            jsonContent = jsonContent.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
        }

        try {
            const shots = JSON.parse(jsonContent);
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
