import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { videoId } = await req.json();
    if (!videoId) return NextResponse.json({ error: "Video ID is required" }, { status: 400 });

    try {
        const transcript = await prisma.transcript.findUnique({
            where: { videoId: videoId }
        });
        if (!transcript || !transcript.content) {
            return NextResponse.json({ error: "No transcript content found for this video" }, { status: 404 });
        }

        let apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            const dbKey = await prisma.apiKey.findUnique({ where: { service: "deepseek_api_key" } });
            if (dbKey?.key) apiKey = Buffer.from(dbKey.key, "base64").toString("utf8");
        }

        if (!apiKey) {
            // Fallback: extract the first few sentences
            const sentences = transcript.content.split(/[.!?。！？]/).filter(Boolean);
            const summary = sentences.slice(0, 3).join(". ") + ".";
            return NextResponse.json({ summary });
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
                        content: "You are a creative social media content strategist. Summarize the following transcript into a short, highly engaging, viral video topic (30 words or less) that can be used directly as a prompt for AI video generation. Return ONLY the summarized topic text, no preamble or quotes."
                    },
                    {
                        role: "user",
                        content: transcript.content
                    }
                ],
                temperature: 0.7,
                max_tokens: 100
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`DeepSeek API returned ${res.status}: ${errText}`);
        }

        const data = await res.json();
        const summary = data.choices?.[0]?.message?.content?.trim() || "";
        return NextResponse.json({ summary });
    } catch (err: any) {
        console.error("[Animated Summarize] Error:", err.message);
        return NextResponse.json({ error: "Summarization failed", details: err.message }, { status: 500 });
    }
}
