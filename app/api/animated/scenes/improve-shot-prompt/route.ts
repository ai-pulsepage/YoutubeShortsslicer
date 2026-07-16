import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { visualPrompt, motionPrompt, primaryCharacter, sceneText, visualStyle } = await req.json();
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
        const systemPrompt = `You are a 3D animation director writing prompts.
Your task is to rewrite the provided visual shot prompt (image composition) and motion prompt (action/movement) so that the focus is on the new primary character/subject specified by the user.
Make sure the description aligns naturally with the context of the scene.
Do NOT change the art style — the style for this project is: "${activeStyle}". The imagePrompt MUST start with this style prefix.
Ensure all references to the old primary character are replaced with the new primary character, and their actions/descriptions fit them correctly.

Return ONLY a valid JSON object with the following keys:
- "imagePrompt": Detailed static scene visual description starting with style prefix.
- "motionPrompt": Focussed action description (e.g. "[Character] points at the chalkboard, smiling"). Do not repeat style or physical descriptors.
- "visualPrompt": Copy of imagePrompt for compatibility.`;

        const userPayload = `Original Image/Visual Prompt: "${visualPrompt}"
Original Motion Prompt: "${motionPrompt || ""}"
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
                max_tokens: 500
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
        let content = data.choices?.[0]?.message?.content?.trim() || "{}";
        if (content.startsWith("```")) {
            content = content.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
        }

        let rewrittenPrompt = visualPrompt;
        let rewrittenMotionPrompt = motionPrompt || "";
        let rewrittenImagePrompt = visualPrompt;

        try {
            const parsed = JSON.parse(content);
            rewrittenImagePrompt = parsed.imagePrompt || rewrittenImagePrompt;
            rewrittenMotionPrompt = parsed.motionPrompt || rewrittenMotionPrompt;
            rewrittenPrompt = parsed.visualPrompt || rewrittenImagePrompt;
        } catch (parseErr) {
            // Fallback if model returned plain text
            rewrittenPrompt = content || visualPrompt;
            rewrittenImagePrompt = content || visualPrompt;
        }

        return NextResponse.json({ 
            rewrittenPrompt, 
            rewrittenImagePrompt, 
            rewrittenMotionPrompt 
        });

    } catch (err: any) {
        console.error("[Improve Shot Prompt] Error:", err.message);
        return NextResponse.json({ error: "Failed to improve shot prompt", details: err.message }, { status: 500 });
    }
}
