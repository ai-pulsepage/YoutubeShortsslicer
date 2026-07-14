import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { prompt, wizardMetadata } = await req.json();
    if (!prompt && !wizardMetadata) return NextResponse.json({ error: "Prompt or wizardMetadata is required" }, { status: 400 });

    try {
        let apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            const dbKey = await prisma.apiKey.findUnique({ where: { service: "deepseek_api_key" } });
            if (dbKey?.key) apiKey = Buffer.from(dbKey.key, "base64").toString("utf8");
        }

        if (!apiKey) {
            // Fallback description expansion
            if (wizardMetadata) {
                const { style, species, ageBracket, attire, customDetails } = wizardMetadata;
                const anthroPrefix = wizardMetadata.anthropomorphic ? "anthropomorphic " : "";
                const generatedText = `${style || "Pixar 3D"} style animation of a ${anthroPrefix}${ageBracket || "child"} ${species || "boy"}${attire ? `, wearing ${attire}` : ""}${customDetails ? `, ${customDetails}` : ""}, friendly look, close-up portrait, plain neutral studio background.`;
                return NextResponse.json({ expandedPrompt: generatedText });
            }
            return NextResponse.json({ expandedPrompt: `${prompt}, 3D cartoon character, friendly smiling face, Pixar style, high quality` });
        }

        let promptToExpand = prompt || "";
        if (wizardMetadata) {
            const { style, subjectClass, species, anthropomorphic, ageBracket, attire, customDetails } = wizardMetadata;
            promptToExpand = `
- Base Style: ${style || "Pixar 3D"}
- Subject Class: ${subjectClass || "Human"}
- Species/Type: ${species || "Boy"}
- Anthropomorphic: ${anthropomorphic ? "Yes (animal that behaves/dresses like a human)" : "No"}
- Age Bracket: ${ageBracket || "Child"}
- Key Attire / Accessory: ${attire || "None"}
- Additional Details / Personality: ${customDetails || prompt || "None"}
`;
        }

        const selectedStyle = wizardMetadata?.style || "Pixar 3D";

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
                        content: `You are an expert prompt engineer for cartoon character avatar generators (specifically optimized for FLUX/SDXL).
Expand the structured user input into a single, high-fidelity visual description prompt.
The prompt must focus ONLY on the character's physical details: facial features, clothing, texture, age, archetype, colors, expression, and the style (${selectedStyle} style animation).
CRITICAL DIRECTIVES:
1. Do NOT describe any scene backgrounds, environments, rooms, backdrops, or actions (such as walking in a forest, standing in a kitchen, running).
2. The background must strictly be described as a "plain, neutral studio background" or "solid color backdrop".
3. Return ONLY the final visual prompt text without any prefixes, intro text, quotes, or wrapping. Keep it under 60 words.`
                    },
                    {
                        role: "user",
                        content: promptToExpand
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
