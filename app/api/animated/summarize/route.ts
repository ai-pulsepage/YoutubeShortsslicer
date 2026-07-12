import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { videoId, premise, scriptText } = await req.json();
    if (!videoId && !premise && !scriptText) {
        return NextResponse.json({ error: "videoId, premise or scriptText is required" }, { status: 400 });
    }

    try {
        let contentToProcess = "";
        if (videoId) {
            const transcript = await prisma.transcript.findUnique({
                where: { videoId: videoId }
            });
            if (!transcript || !transcript.content) {
                return NextResponse.json({ error: "No transcript content found for this video" }, { status: 404 });
            }
            contentToProcess = transcript.content;
        } else {
            contentToProcess = premise || scriptText || "";
        }

        let apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            const dbKey = await prisma.apiKey.findUnique({ where: { service: "deepseek_api_key" } });
            if (dbKey?.key) apiKey = Buffer.from(dbKey.key, "base64").toString("utf8");
        }

        if (!apiKey) {
            // Fallback: build a default structured story from the transcript
            const sentences = contentToProcess.split(/[.!?。！？]/).filter(Boolean).slice(0, 4);
            const scenes = sentences.map((sentence: string, idx: number) => ({
                id: `scene-${idx}`,
                type: idx % 3 === 2 ? "song" : "dialogue",
                character: idx % 2 === 0 ? "Leo" : "Narrator",
                voice: idx % 2 === 0 ? "en-US-AnaNeural-Female" : "en-US-GuyNeural-Male",
                text: sentence.trim() + ".",
                visualPrompt: `Cartoon ${idx % 2 === 0 ? "boy Leo smiling" : "landscape background"}, 3d animation style, Pixar look`
            }));
            return NextResponse.json({ scenes });
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
                        content: `You are an expert children's content writer. Read the transcript of a video, and rewrite it into an original, short storyboard script (5 scenes or less) containing dialog and sing-along songs.
Return ONLY a valid JSON array of scenes without any markdown wrapping or preamble.
The JSON structure for each scene must follow this schema:
[
  {
    "type": "dialogue" | "song",
    "character": "Narrator" | "Leo" | "Lily",
    "voice": "en-US-AnaNeural-Female" | "zh-CN-XiaoyiNeural-Female" | "en-US-GuyNeural-Male" | "en-US-AriaNeural-Female",
    "text": "The dialog spoken or lyrics sung in this scene. Swap original names like JJ/CeCe to Leo/Lily.",
    "visualPrompt": "Detailed scene generation prompt for a 3D cartoon video generator."
  }
]`
                    },
                    {
                        role: "user",
                        content: contentToProcess
                    }
                ],
                temperature: 0.7,
                max_tokens: 3000
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

        // Remove markdown block wraps if present
        if (content.startsWith("```")) {
            content = content.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
        }

        try {
            const scenes = JSON.parse(content);
            // Assign stable client-side IDs
            const mappedScenes = (Array.isArray(scenes) ? scenes : [scenes]).map((s: any, idx: number) => ({
                id: `scene-${idx}-${Date.now()}`,
                type: s.type || "dialogue",
                character: s.character || "Narrator",
                voice: s.voice || "en-US-GuyNeural-Male",
                text: s.text || "",
                visualPrompt: s.visualPrompt || "Cartoon style visual background"
            }));
            return NextResponse.json({ scenes: mappedScenes });
        } catch (parseErr: any) {
            console.warn("[Animated Summarize] Failed to parse DeepSeek JSON, returning default mapping:", parseErr);
            return NextResponse.json({
                scenes: [
                    {
                        id: `scene-fallback-${Date.now()}`,
                        type: "dialogue",
                        character: "Narrator",
                        voice: "en-US-GuyNeural-Male",
                        text: content,
                        visualPrompt: "A scenic cartoon background, 3d animation"
                    }
                ]
            });
        }
    } catch (err: any) {
        console.error("[Animated Summarize] Error:", err.message);
        return NextResponse.json({ error: "Summarization failed", details: err.message }, { status: 500 });
    }
}
