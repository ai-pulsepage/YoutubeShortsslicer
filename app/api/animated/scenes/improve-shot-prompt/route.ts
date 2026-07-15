import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { visualPrompt, primaryCharacter, sceneText, visualStyle } = await req.json();
    if (!visualPrompt) return NextResponse.json({ error: "visualPrompt is required" }, { status: 400 });

    try {
        let apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            const dbKey = await prisma.apiKey.findUnique({ where: { service: "deepseek_api_key" } });
            if (dbKey?.key) apiKey = Buffer.from(dbKey.key, "base64").toString("utf8");
        }

        if (!apiKey) {
            return NextResponse.json({ error: "DEEPSEEK_KEY_MISSING", details: "DeepSeek API key is not configured. Please define process.env.DEEPSEEK_API_KEY or save it in settings." }, { status: 400 });
        }

        const activeStyle = visualStyle || "Pixar 3D cartoon";
        const systemPrompt = `You are a 3D animation director writing prompts for a video generation model.
Your task is to rewrite the provided visual shot prompt so that the focus is on the new primary character/subject specified by the user.
Make sure the description aligns naturally with the context of the scene.
Do NOT change the art style — the style for this project is: "${activeStyle}". All prompts must start with this style prefix.
Ensure all references to the old primary character are replaced with the new primary character, and their actions/descriptions fit them correctly.
Expand the prompt into a complete director's shot brief including: character name + brief physical description, a dynamic action that fills the shot duration naturally, camera angle, and setting/background context.
CRITICAL: The video generator reads ONLY this shot card with no memory of other shots — the prompt must be completely self-contained.
Return ONLY the newly rewritten prompt text without quotes, notes, or preamble.`;

        const userPayload = `Original Prompt: "${visualPrompt}"
New Primary Character: "${primaryCharacter}"
Scene Context Dialogue/Song: "${sceneText || ""}"`;

        const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPayload }
                ],
                temperature: 0.6,
                max_tokens: 300
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            if (res.status === 402 || errText.toLowerCase().includes("insufficient_balance") || errText.toLowerCase().includes("balance") || errText.toLowerCase().includes("credit")) {
                return NextResponse.json({ error: "DEEPSEEK_OUT_OF_FUNDS" }, { status: 402 });
            }
            throw new Error(`DeepSeek API returned ${res.status}: ${errText}`);
        }

        const data = await res.json();
        const rewrittenPrompt = data.choices?.[0]?.message?.content?.trim() || visualPrompt;

        return NextResponse.json({ rewrittenPrompt });

    } catch (err: any) {
        console.error("[Improve Shot Prompt] Error:", err.message);
        return NextResponse.json({ error: "Failed to improve shot prompt", details: err.message }, { status: 500 });
    }
}
