import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const NARRATOR_PROMPTS: Record<string, string> = {
    explanatory: `You are a calm educational documentary narrator. Rewrite this transcript as a clear narration explaining what's happening. Sound like David Attenborough. Keep it concise — must fit original duration when spoken naturally. Output ONLY the narration script.`,
    sarcastic: `You are a sarcastic social media commentator. Rewrite this as outrageous sarcastic commentary designed to make viewers laugh and comment angrily. Output ONLY the narration script.`,
    wrong: `You are a comedy narrator who intentionally misinterprets everything. Describe what's happening in a completely wrong, hilarious way. Output ONLY the narration script.`,
    dramatic: `You are a dramatic film narrator. Rewrite as if this is the most epic moment in history. Use "Little did they know...", "In a world where...", dramatic pauses. Output ONLY the narration script.`,
    eli5: `Explain this to a curious 5-year-old. Short sentences, simple words, enthusiasm. Output ONLY the narration script.`,
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { segmentId, narratorMode } = await req.json();

    const transcript = await prisma.transcript.findUnique({ where: { videoId: id } });
    if (!transcript) return NextResponse.json({ error: "No transcript" }, { status: 404 });

    const segment = await prisma.segment.findUnique({ where: { id: segmentId } });
    if (!segment) return NextResponse.json({ error: "Segment not found" }, { status: 404 });

    const allWords = (transcript.segments as any[]) || [];
    const segmentWords = allWords.filter(
        (w: any) => w.start >= segment.startTime && w.end <= segment.endTime
    );
    const segmentText = segmentWords.map((w: any) => w.text).join(" ") || "";

    const systemPrompt = NARRATOR_PROMPTS[narratorMode];
    if (!systemPrompt) return NextResponse.json({ error: "Unknown mode" }, { status: 400 });

    let apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        const dbKey = await prisma.apiKey.findUnique({ where: { service: "deepseek_api_key" } });
        if (dbKey?.key) apiKey = Buffer.from(dbKey.key, "base64").toString("utf8");
    }
    if (!apiKey) return NextResponse.json({ error: "No DeepSeek API key" }, { status: 500 });

    try {
        const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Transcript:\n${segmentText}` },
                ],
                temperature: 0.8,
                max_tokens: 500,
            }),
        });

        const data = await res.json();
        const script = data.choices?.[0]?.message?.content?.trim() || "";
        return NextResponse.json({ script });
    } catch (err: any) {
        return NextResponse.json({ error: "LLM Generation failed", details: err.message }, { status: 500 });
    }
}
