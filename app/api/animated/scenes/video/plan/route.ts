import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { lyrics, numShots, characters } = await req.json();
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
            // Fallback plan
            const shots = [];
            for (let i = 0; i < numShots; i++) {
                shots.push({
                    index: i + 1,
                    primaryCharacter: characters?.[i % characters.length]?.name || "Narrator",
                    visualPrompt: `Pixar style cartoon scene background, step ${i + 1} of story.`
                });
            }
            return NextResponse.json({ shots });
        }

        const systemPrompt = `You are a professional kids TV storyboard director. Break down the provided song lyrics/text into EXACTLY ${numShots} consecutive visual shots (each representing a 5-second video clip).
CRITICAL RULES:
1. You MUST generate exactly ${numShots} shots. No more, no less.
2. For each shot, assign the "primaryCharacter" from the following cast list: ${characterNames}. Choose the character who should be the main subject of that shot.
3. Write a vivid, 3D Pixar cartoon visual prompt mapping the story beats of the lyrics to that character's action in that shot.

Return ONLY a valid JSON array of shots without any markdown wrapping or preamble.
JSON Schema:
[
  {
    "index": number, // 1-indexed
    "primaryCharacter": "One of: ${characterNames}",
    "visualPrompt": "Detailed visual animation prompt."
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
            console.error("[Storyboard Plan] Parse failed:", parseErr);
            // Return fallback sequence
            const shots = [];
            for (let i = 0; i < numShots; i++) {
                shots.push({
                    index: i + 1,
                    primaryCharacter: characters?.[i % characters.length]?.name || "Narrator",
                    visualPrompt: `A 3D cartoon scene background, Pixar style, part ${i + 1} matching lyrics.`
                });
            }
            return NextResponse.json({ shots });
        }

    } catch (err: any) {
        console.error("[Storyboard Plan] Error:", err.message);
        return NextResponse.json({ error: "Failed to plan storyboard", details: err.message }, { status: 500 });
    }
}
