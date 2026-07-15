import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { videoId, premise, scriptText, characters, targetDuration, defaultShotDuration, compositionMode, includeMusicals, visualStyle, targetAge, genre } = await req.json();
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
            return NextResponse.json(
                { error: "DEEPSEEK_KEY_MISSING", details: "DeepSeek API key is not configured. Please add it in Settings." },
                { status: 503 }
            );
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
        const maxWordCount = Math.round((defaultShotDuration || 5) * 2.5);
        const systemPrompt = `You are an expert children's content writer. Read the following input (which is ${isSpinOff ? "a simple narrative premise outline" : "a story script"}), and rewrite it into a highly original storyboard script consisting of exactly ${numScenes} scenes.

TARGET AUDIENCE & STYLE SETTINGS:
- Dialogue Pacing (type: "dialogue" ONLY): Write natural, engaging narration or dialogue. Do NOT stuff words just to fill time. The absolute maximum is ${maxWordCount} words per dialogue scene to prevent TTS audio from running longer than the video clip. Short, punchy lines (5-10 words) are preferred — let the animation carry the scene.
- Song Lyrics (type: "song" ONLY): The word limit above does NOT apply to song scenes. Songs are played from a user-uploaded Suno MP3, so duration is handled externally. Write the COMPLETE song in a single scene — all verses, chorus, bridge, and repeated hooks as one continuous block of lyrics in the "text" field. A well-written song should have 3-6 verses minimum. NEVER split a single song across multiple scenes: one song = exactly one scene.
- Director's Shot Brief: You are directing a camera crew who reads ONLY the current shot card — they have zero memory of any previous scene. Every "visualPrompt" must be a complete, self-contained director's brief that includes: (1) the style prefix "${selectedStyle} style animation of...", (2) the character's name AND a brief physical description so the video model can identify them (e.g. "Buddy, a small orange tabby kitten with big green eyes"), (3) the specific action or motion happening in this shot (make it dynamic enough to fill ${defaultShotDuration || 5} seconds of video naturally), and (4) the setting/background. Think like a film director writing a shot card for a crew that has never seen the script.
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
  ? `4. MUSIC SEGREGATION & SONG STRUCTURE RULES:
   - You may include both "dialogue" and "song" scene types. Use your judgment as a director — decide how many songs fit the story's genre, pacing, and emotional beats naturally.
   - For each song scene, you MUST write a COMPLETE song — all verses, chorus, bridge, and any repeated hooks — as one continuous block of lyrics in the "text" field. NEVER put individual bars or lyric lines as separate song scenes. One song = exactly one scene.
   - Each song scene MUST include a "sunoStylePrompt" key with a Suno AI music style suggestion (e.g. "upbeat kids singalong, bright bells, acoustic ukulele, 120bpm").
   - The song lyrics in "text" can be as long as the song requires — this is expected and correct. Do NOT truncate lyrics.`
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
    "visualPrompt": "Full director's shot brief starting with style prefix. Example: \\"${selectedStyle} style animation of [characterName], [brief physical description], [specific dynamic action filling the shot duration], [camera angle], [setting/background detail]\\".",
    "sunoStylePrompt": "Suno style suggestion (only for song types, empty string otherwise)"
  }
]

Note: For child boy character roles (like Jimmy), you must assign "en-US-ChristopherNeural-Male" instead of the adult voice.`;

        let content = "";
        try {
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
                throw new Error(`DeepSeek API returned ${res.status}: ${errText}`);
            }

            const data = await res.json();
            content = data.choices?.[0]?.message?.content?.trim() || "";
        } catch (deepSeekErr: any) {
            console.warn("[Summarize] DeepSeek request failed, trying Gemini fallback:", deepSeekErr.message);
            try {
                content = await callGeminiFallback(systemPrompt, premiseOutline);
            } catch (geminiErr: any) {
                console.error("[Summarize] Gemini fallback also failed:", geminiErr.message);
                return NextResponse.json({
                    error: "AI_GENERATION_FAILED",
                    details: `Both DeepSeek and Gemini fallback failed. DeepSeek error: ${deepSeekErr.message}. Gemini error: ${geminiErr.message}`
                }, { status: 500 });
            }
        }

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
            console.error("[Animated Summarize] Failed to parse AI JSON response:", parseErr.message);
            return NextResponse.json(
                { error: "AI_RESPONSE_PARSE_ERROR", details: "The AI returned a malformed storyboard response. Please try generating again." },
                { status: 500 }
            );
        }
    } catch (err: any) {
        console.error("[Animated Summarize] Error:", err.message);
        return NextResponse.json({ error: "Summarization failed", details: err.message }, { status: 500 });
    }
}

async function callGeminiFallback(systemPrompt: string, userPrompt: string): Promise<string> {
    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        const dbKey = await prisma.apiKey.findUnique({ where: { service: "gemini_api_key" } });
        if (dbKey?.key) apiKey = Buffer.from(dbKey.key, "base64").toString("utf8");
    }

    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured in environment or database.");
    }

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{ text: systemPrompt }]
                },
                contents: [
                    {
                        role: "user",
                        parts: [{ text: userPrompt }]
                    }
                ],
                generationConfig: {
                    temperature: 0.7,
                    responseMimeType: "application/json"
                }
            })
        }
    );

    if (!res.ok) {
        throw new Error(`Gemini API returned status ${res.status}: ${await res.text()}`);
    }

    const json = await res.json();
    const content = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!content) {
        throw new Error("Empty response from Gemini");
    }

    return content;
}
