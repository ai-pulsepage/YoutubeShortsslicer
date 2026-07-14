import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { videoId, premise, scriptText, characters, targetDuration, compositionMode, includeMusicals, visualStyle, targetAge, genre } = await req.json();
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

        const durationMin = targetDuration ? parseFloat(targetDuration) : 2.0;
        const numScenes = Math.max(3, Math.min(25, Math.ceil(durationMin * 3)));
        const useMusicals = includeMusicals !== false;
        const isSpinOff = compositionMode !== "paraphrase";

        const selectedStyle = visualStyle || "Pixar 3D";
        const selectedAge = targetAge || "Kids";
        const selectedGenre = genre || "Adventure";

        if (!apiKey) {
            // Fallback: build a default structured story from the transcript
            const sentences = contentToProcess.split(/[.!?。！？]/).filter(Boolean).slice(0, numScenes);
            const scenes = sentences.map((sentence: string, idx: number) => ({
                id: `scene-${idx}`,
                type: idx % 3 === 2 && useMusicals ? "song" : "dialogue",
                character: idx % 2 === 0 ? (characters?.[0]?.name || "Leo") : "Narrator",
                voice: idx % 2 === 0 ? "en-US-AnaNeural-Female" : "en-US-GuyNeural-Male",
                text: sentence.trim() + ".",
                visualPrompt: `A beautiful scenic scene matching the "${selectedStyle}" animation style, ${selectedGenre} theme, showing ${idx % 2 === 0 ? (characters?.[0]?.name || "Leo") : "the landscape"}`,
                sunoStylePrompt: idx % 3 === 2 && useMusicals ? "upbeat children singalong, acoustic guitar, 120bpm" : ""
            }));
            return NextResponse.json({ scenes });
        }

        // Phase 1: High-Level Concept Summary Extraction (only in Spin-off Mode for Ingested Videos)
        let premiseOutline = contentToProcess;
        if (videoId && isSpinOff) {
            console.log(`[Summarize] Performing Step 1 concept summary on long video transcript...`);
            const summaryPrompt = `You are a children's content director. Read the following ingested video transcript, and output ONLY a simple 1-paragraph summary outline of the core events, character actions, and themes (e.g. "Jimmy wakes up, Lily greets him, Buddy plays in a cape, mother Jenny serves juice, they sing together"). Do NOT output dialogues, verses or songs. Make it plain, descriptive prose.`;
            
            try {
                const outlineRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: "deepseek-chat",
                        messages: [
                            { role: "system", content: summaryPrompt },
                            { role: "user", content: contentToProcess }
                        ],
                        temperature: 0.3,
                        max_tokens: 800
                    })
                });
                
                if (outlineRes.ok) {
                    const summaryData = await outlineRes.json();
                    premiseOutline = summaryData.choices?.[0]?.message?.content?.trim() || contentToProcess;
                    console.log(`[Summarize] Concept outline extracted successfully:`, premiseOutline);
                } else {
                    console.warn(`[Summarize] Concept outline fetch failed, using transcript raw content.`);
                }
            } catch (outlineErr: any) {
                console.error(`[Summarize] Concept outline call errored:`, outlineErr.message);
            }
        }

        // Phase 2: Creative Composition
        const systemPrompt = `You are an expert children's content writer. Read the following input (which is ${isSpinOff ? "a simple narrative premise outline" : "a story script"}), and rewrite it into a highly original storyboard script consisting of exactly ${numScenes} scenes.

TARGET AUDIENCE & STYLE SETTINGS:
- Visual Style Constraint: All visual prompts must strictly start with the style preset prefix (e.g., "${selectedStyle} style animation of...") to enforce the visual theme. The visual prompt must be concise, under 20 words, and explicitly name the character (e.g. "Jimmy the cat") so the image adapter can map the reference face portrait.
- Target Audience Age: The tone of the dialogue, themes, and vocabulary must be tailored specifically for the "${selectedAge}" age bracket.
- Genre: The story narrative style, pacing, and overall themes must fit the "${selectedGenre}" genre.

CRITICAL COMPLIANCE RULES:
1. COMPLETE ORIGINALITY & COPYRIGHT PROTECTION: You must compose all dialogue and song lyrics entirely from scratch. Do NOT reuse existing song lyrics or word-for-word structures. Use completely different metaphors, rhyming patterns, and vocabularies to guarantee 100% legal safety.
${isSpinOff 
  ? `2. CREATIVE SPIN-OFF: The input is a raw premise outline. You are NOT bound to the scene counts or ordering of any original video. Write a completely fresh, organic children's story sequence. Decide naturally where to place song numbers (if musicals are enabled) to help narrate the outline's theme.`
  : `2. DIRECT REWRITE / PARAPHRASE: Keep the exact same pacing, structure, and scene-by-scene sequence as the input script, but rephrase all dialogues and lyrics to be legally distinct.`
}
3. CAST ALIGNMENT: You MUST ONLY use the following characters for the speaker roles and dialogue: ${characterNames}. Always assign the speaker roles correctly based on this cast.
${useMusicals 
  ? `4. MUSIC SEGREGATION: You can include both "dialogue" and "song" scene types. For all scenes with type "song", you MUST write catchy kids song lyrics and include a "sunoStylePrompt" key suggesting a musical style/prompt for Suno AI (e.g. "upbeat kids singalong, bright bells, acoustic ukulele, 120bpm").` 
  : `4. DIALOGUE ONLY: You must ONLY generate scenes of type "dialogue". DO NOT generate any "song" scenes or Suno prompts. The entire storyboard timeline must consist of character dialogues/narrations.`
}

Return ONLY a valid JSON array of scenes without any markdown wrapping or preamble.
The JSON structure for each scene must follow this schema:
[
  {
    "type": "${useMusicals ? "dialogue | song" : "dialogue"}",
    "character": "One of: ${characterNames}",
    "voice": "en-US-AnaNeural-Female" | "en-US-ChristopherNeural-Male" | "zh-CN-XiaoyiNeural-Female" | "en-US-GuyNeural-Male" | "en-US-AriaNeural-Female",
    "text": "The original polished dialogue spoken${useMusicals ? " or song lyrics sung" : ""} in this scene.",
    "visualPrompt": "Concise prompt (under 20 words) starting with style, e.g.: \\"${selectedStyle} style animation of [characterName] [doing action], [background]\\".",
    "sunoStylePrompt": "Suno style suggestion (only for song types, empty string otherwise)"
  }
]

Note: For child boy character roles (like Jimmy), you must assign "en-US-ChristopherNeural-Male" instead of the adult voice.`;

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
                        content: premiseOutline
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
