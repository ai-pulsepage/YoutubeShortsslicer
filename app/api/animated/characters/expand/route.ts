import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { prompt } = await req.json();
    if (!prompt) return NextResponse.json({ error: "Prompt is required" }, { status: 400 });

    try {
        let apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            const dbKey = await prisma.apiKey.findUnique({ where: { service: "deepseek_api_key" } });
            if (dbKey?.key) apiKey = Buffer.from(dbKey.key, "base64").toString("utf8");
        }

        if (!apiKey) {
            // Fallback description expansion
            return NextResponse.json({ expandedPrompt: `${prompt}, 3D cartoon character, friendly smiling face, Pixar style, high quality` });
        }

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
                        content: "You are an expert prompt engineer for 3D cartoon character generators. Expand the user's basic character idea into a vivid, descriptive prompt focused ONLY on the character's physical features (clothing, fur/skin texture, friendly child-friendly look, eyes, face, colors, style: Pixar 3D). CRITICAL: Do NOT describe any scene backgrounds, environments, rooms, backdrops, or situational actions (such as calling someone for dinner or standing in a kitchen). The background must be described as a plain, neutral, or transparent studio backdrop. This ensures the character can be seamlessly composited into any scene timeline later. Return ONLY the final visual prompt text without any introductory text, prefix, or wrapping."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 300
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
        const expandedPrompt = data.choices?.[0]?.message?.content?.trim() || prompt;

        return NextResponse.json({ expandedPrompt });

    } catch (err: any) {
        console.error("[Character Prompt Expand] Error:", err.message);
        return NextResponse.json({ error: "Expansion failed", details: err.message }, { status: 500 });
    }
}
