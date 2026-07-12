import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { videoId, premise, scriptText, characters } = await req.json();
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

        const characterNames = (characters && Array.isArray(characters) && characters.length > 0)
            ? characters.map((c: any) => c.name).join(", ")
            : "Narrator, Leo, Lily";

        if (!apiKey) {
            // Fallback: build a default structured story from the transcript
            const sentences = contentToProcess.split(/[.!?。！？]/).filter(Boolean).slice(0, 4);
            const scenes = sentences.map((sentence: string, idx: number) => ({
                id: `scene-${idx}`,
                type: idx % 3 === 2 ? "song" : "dialogue",
                character: idx % 2 === 0 ? (characters?.[0]?.name || "Leo") : "Narrator",
                voice: idx % 2 === 0 ? "en-US-AnaNeural-Female" : "en-US-GuyNeural-Male",
                text: sentence.trim() + ".",
                visualPrompt: `Cartoon ${idx % 2 === 0 ? "boy smiling" : "landscape background"}, 3d animation style, Pixar look`,
                sunoStylePrompt: idx % 3 === 2 ? "upbeat children singalong, acoustic guitar, 120bpm" : ""
            }));
            return NextResponse.json({ scenes });
        }

        const systemPrompt = `You are an expert children's content writer. Read the transcript/premise/script of a story, and rewrite it into an original, short storyboard script (5 scenes or less) containing dialogue and sing-along songs.

CRITICAL COMPLIANCE RULES:
1. COPYRIGHT PROTECTION: Do NOT copy lyrics, text, or dialogue directly from the input. You must rewrite the story beats to be completely original, newly composed, and legally distinct.
2. CAST ALIGNMENT: You MUST ONLY use the following characters for the speaker roles and dialogue: ${characterNames}. Do NOT invent other characters or fall back to names like Leo or Lily unless they are explicitly in this cast list. Always assign the speaker roles correctly based on this cast.
3. SUNO AI MUSIC PROMPTING: For all scenes with type "song", you MUST include a "sunoStylePrompt" key suggesting a musical style/prompt for Suno AI (e.g. "upbeat kids singalong, bright bells, acoustic ukulele, 120bpm").

Return ONLY a valid JSON array of scenes without any markdown wrapping or preamble.
The JSON structure for each scene must follow this schema:
[
  {
    "type": "dialogue" | "song",
    "character": "One of: ${characterNames}",
    "voice": "en-US-AnaNeural-Female" | "zh-CN-XiaoyiNeural-Female" | "en-US-GuyNeural-Male" | "en-US-AriaNeural-Female",
    "text": "The original polished dialogue spoken or song lyrics sung in this scene.",
    "visualPrompt": "Detailed scene generation prompt for a 3D cartoon video generator featuring the character.",
    "sunoStylePrompt": "Suno style suggestion (only for song types, empty string otherwise)"
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
                character: s.character || (characters?.[0]?.name || "Narrator"),
                voice: s.voice || "en-US-GuyNeural-Male",
                text: s.text || "",
                visualPrompt: s.visualPrompt || "Cartoon style visual background",
                sunoStylePrompt: s.sunoStylePrompt || ""
            }));
            return NextResponse.json({ scenes: mappedScenes });
        } catch (parseErr: any) {
            console.warn("[Animated Summarize] Failed to parse DeepSeek JSON, returning default mapping:", parseErr);
            return NextResponse.json({
                scenes: [
                    {
                        id: `scene-fallback-${Date.now()}`,
                        type: "dialogue",
                        character: characters?.[0]?.name || "Narrator",
                        voice: "en-US-GuyNeural-Male",
                        text: content,
                        visualPrompt: "A scenic cartoon background, 3d animation",
                        sunoStylePrompt: ""
                    }
                ]
            });
        }
    } catch (err: any) {
        console.error("[Animated Summarize] Error:", err.message);
        return NextResponse.json({ error: "Summarization failed", details: err.message }, { status: 500 });
    }
}
