import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { text, type } = await req.json();
    if (!text) return NextResponse.json({ error: "Text is required" }, { status: 400 });

    try {
        let apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            const dbKey = await prisma.apiKey.findUnique({ where: { service: "deepseek_api_key" } });
            if (dbKey?.key) apiKey = Buffer.from(dbKey.key, "base64").toString("utf8");
        }

        if (!apiKey) {
            // Fallback
            return NextResponse.json({ improvedText: text });
        }

        const isSong = type === "song";
        const systemPrompt = isSong
            ? "You are an expert children's songwriter. Improve the song lyrics provided by the user, making them catchier, rhyming, upbeat, and child-friendly. Return ONLY the polished song lyrics without any preamble, notes, or quotes."
            : "You are an expert children's TV script writer. Improve the dialogue line provided by the user, making it sound natural, enthusiastic, clean, and perfectly suited for a cartoon narrator or toddler show. Return ONLY the polished dialogue text without any preamble, notes, or quotes.";

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
                        content: text
                    }
                ],
                temperature: 0.7,
                max_tokens: 400
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
        const improvedText = data.choices?.[0]?.message?.content?.trim() || text;

        return NextResponse.json({ improvedText });

    } catch (err: any) {
        console.error("[Scene Script Improve] Error:", err.message);
        return NextResponse.json({ error: "Script improvement failed", details: err.message }, { status: 500 });
    }
}
