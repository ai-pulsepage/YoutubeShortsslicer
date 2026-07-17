import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeVideoVisually } from "@/lib/documentary/video-analyzer";

const LANGUAGE_VOICES: Record<string, { childFemale: string; male: string; default: string }> = {
    spanish: {
        childFemale: "es-MX-DaliaNeural-Female",
        male: "es-ES-AlvaroNeural-Male",
        default: "es-MX-DaliaNeural-Female"
    },
    french: {
        childFemale: "fr-FR-DeniseNeural-Female",
        male: "fr-FR-HenriNeural-Male",
        default: "fr-FR-DeniseNeural-Female"
    },
    german: {
        childFemale: "de-DE-AmalaNeural-Female",
        male: "de-DE-KillianNeural-Male",
        default: "de-DE-AmalaNeural-Female"
    },
    italian: {
        childFemale: "it-IT-ElsaNeural-Female",
        male: "it-IT-DiegoNeural-Male",
        default: "it-IT-ElsaNeural-Female"
    },
    korean: {
        childFemale: "ko-KR-SunHiNeural-Female",
        male: "ko-KR-InJoonNeural-Male",
        default: "ko-KR-SunHiNeural-Female"
    },
    chinese: {
        childFemale: "zh-CN-XiaoyiNeural-Female",
        male: "zh-CN-YunxiNeural-Male",
        default: "zh-CN-XiaoyiNeural-Female"
    }
};

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

        // Split characters into anchored (has a blueprint prompt) and free (name only)
        const anchoredCharacters = (characters && Array.isArray(characters))
            ? characters.filter((c: any) => c.prompt && c.prompt.trim().length > 0)
            : [];
        const freeCharacters = (characters && Array.isArray(characters))
            ? characters.filter((c: any) => !c.prompt || c.prompt.trim().length === 0)
            : [];

        const allCharacterNames = (characters && Array.isArray(characters) && characters.length > 0)
            ? characters.map((c: any) => c.name).join(", ")
            : "Narrator, Leo, Lily";

        const anchoredRoster = anchoredCharacters.length > 0
            ? anchoredCharacters.map((c: any) => `- ${c.name}: ${c.prompt.trim()}`).join("\n")
            : "";

        const freeRoster = freeCharacters.length > 0
            ? freeCharacters.map((c: any) => `- ${c.name}: invent a specific, vivid physical description on first use and repeat it exactly in every scene — never vary it.`).join("\n")
            : "";

        const durationMin = targetDuration ? parseFloat(targetDuration) : 2.0;
        const numScenes = Math.max(3, Math.min(25, Math.ceil(durationMin * 3)));
        const useMusicals = includeMusicals !== false;
        const isSpinOff = compositionMode !== "paraphrase";

        const selectedStyle = visualStyle || "Pixar 3D";
        const selectedAge = targetAge || "Kids";
        const selectedGenre = genre || "Adventure";

        // Best-in-class prompt prefix per style — these are engineered for Flux/Wan2.2 image & video generation
        const STYLE_PROMPT_PREFIX: Record<string, string> = {
            "Pixar 3D": "Pixar-style 3D CGI animation, vibrant colors, expressive character faces, smooth subsurface skin shading, cinematic lighting,",
            "Studio Ghibli": "Studio Ghibli hand-painted anime style, soft impressionistic backgrounds, delicate linework, warm natural lighting, Hayao Miyazaki aesthetic,",
            "Classic Anime": "classic cel-shaded anime, bold clean outlines, flat vibrant colors, expressive eyes, dynamic pose, 90s anime aesthetic,",
            "Claymation": "Aardman Animations claymation stop-motion style, textured clay surfaces, fingerprint-visible handcrafted look, warm soft studio lighting,",
            "Hand-Drawn / Watercolor": "hand-drawn watercolor storybook illustration, soft paint washes, visible brushstroke texture, delicate ink outlines, warm pastel palette,",
            "Retro Cartoon (90s)": "90s Saturday morning retro cartoon style, thick bold black outlines, flat bright colors, energetic squash-and-stretch animation,",
            "Realistic CGI": "photorealistic CGI animation, high-fidelity surface textures, ray-traced global illumination, detailed environment rendering,",
        };
        const stylePrefix = STYLE_PROMPT_PREFIX[selectedStyle] || `${selectedStyle} style animation,`;

        // Genre × Age director's brief matrix — guides tone register without caging the AI
        const GENRE_AGE_BRIEF: Record<string, Record<string, string>> = {
            "Comedy": {
                "Toddlers": "This is a bouncy, giggle-first toddler comedy where humor lives in the unexpected and the silly. Things fall over, faces make big expressions, animals do wrong things in delightful ways. Sentences are single ideas. Rhythm is peek-a-boo — setup, pause, surprise. Sound words and repetition are your friends.",
                "Kids":    "This is a fast-moving, laugh-out-loud kids comedy in the spirit of a Saturday morning cartoon. Physical gags, joyful chaos, and surprise reversals carry the energy. Sentences punch short. The camera loves the absurd moment. Characters are slightly too confident and immediately wrong — and that's the joke.",
                "Teens (13+)": "This is a dry, self-aware teen comedy where humor comes from understatement and relatable mortification. Characters know they're in a ridiculous situation and comment on it. Sarcasm is light, never mean. Sentences are longer with internal asides. The joke lands in the pause, not the punchline.",
            },
            "Adventure": {
                "Toddlers": "This is a gentle wonder-walk where a tiny hero discovers something new just around the corner. The adventure is the size of a backyard — enormous to a toddler. Every discovery is celebrated. Nothing is scary. Short, excited sentences. The world is enormous and friendly.",
                "Kids":    "This is a quest-driven adventure with real stakes, brave choices, and a satisfying victory. Action verbs lead every scene — sprint, climb, discover, brave. Pacing is quick and urgent. Characters face an obstacle, make a bold decision, and push forward. Sentences build speed as tension rises.",
                "Teens (13+)": "This is a high-stakes adventure where the outer journey mirrors an inner one. The action is real but the emotional weight — courage, identity, sacrifice — is the true plot. Sentence structure shifts with tension: short in action, longer and reflective in quiet moments. The hero earns their resolution.",
            },
            "Fantasy": {
                "Toddlers": "This is a soft, enchanted world where magic is ordinary and friendly creatures help little ones. Everything glows gently. Words are simple. Wonder is expressed with wide eyes and quiet awe. The magic never threatens — it only delights.",
                "Kids":    "This is an epic children's fantasy with genuine wonder and real magical stakes. Spells have consequences. Creatures have personalities. Vocabulary reaches — 'shimmering,' 'ancient,' 'whispered enchantment' — but always stays accessible. Exclamation lives in discovery, not danger.",
                "Teens (13+)": "This is a coming-of-age fantasy where the magic system reflects emotional truth. Power is earned through growth, not given. The tone is epic but introspective — characters question their role in the larger story. Language is layered: rich imagery, longer sentences, a sense of myth.",
            },
            "Bedtime Story": {
                "Toddlers": "This is a sleepy lullaby in story form. The pace slows to a heartbeat. Every sentence is soft, short, and settling. Yawns happen. Stars appear. The world grows quiet one thing at a time. No excitement — only the gentle pull toward sleep. Warmth and safety in every word.",
                "Kids":    "This is a calming wind-down story where the day gently closes. A small, satisfying resolution — nothing big, just right. Imagery is cozy and dim: lantern glow, warm blankets, distant crickets. Sentences slow and lengthen as the story softens. No cliffhangers. The ending is rest.",
                "Teens (13+)": "This is a reflective, atmospheric nighttime story — more mood piece than plot. The tone is quiet and philosophical without being heavy. A character pauses and notices something true about the world or themselves. Prose is the most literary here: longer sentences, soft imagery, a final line that lingers.",
            },
            "Teen Romance": {
                "Toddlers": "This is a warm friendship story full of kindness and sharing. Two little ones discover that being a good friend feels wonderful. Simple sentences, gentle emotions, small moments of connection.",
                "Kids":    "This is a heartfelt story about a meaningful new friendship — the excitement of meeting someone who just gets you, the courage to say hello. Warm and sweet, without romantic stakes.",
                "Teens (13+)": "This is a tender, introspective first-love story told in slow beats. The feeling matters more than the event. Internal experience is the plot — a look across a room, the moment before saying something important. Sentences are the longest and most reflective. Vocabulary is emotionally precise: 'something shifted,' 'without meaning to,' 'she almost said.' Bittersweet is allowed.",
            },
            "Sci-Fi": {
                "Toddlers": "This is space as a playground — friendly rockets, blinking stars, round little robots that beep. The universe is enormous and completely safe. Short discovery sentences. Everything beeps, blinks, or bounces pleasingly. Science is just magic with buttons.",
                "Kids":    "This is an energetic, curiosity-driven kids sci-fi where technology is a tool for adventure. Robots have personalities. Space travel is fun. Problems get solved with clever thinking. Science vocabulary sneaks in naturally — gravity, orbit, signal — without becoming a lesson. The tone is wonder with urgency.",
                "Teens (13+)": "This is a thoughtful teen sci-fi where technology is the lens, not the point. Questions of identity, connection, and what makes us human run beneath the plot. Tone can be tense or melancholy alongside excitement. The science is real but the stakes are personal.",
            },
        };
        const toneBrief = GENRE_AGE_BRIEF[selectedGenre]?.[selectedAge]
            ?? `Write this story in a ${selectedGenre} style appropriate for ${selectedAge}.`;

        if (!apiKey) {
            return NextResponse.json(
                { error: "DEEPSEEK_KEY_MISSING", details: "DeepSeek API key is not configured. Please add it in Settings." },
                { status: 503 }
            );
        }

        // Phase 1: High-Level Concept Summary Extraction (only in Spin-off Mode for Ingested Videos)
        let premiseOutline = contentToProcess;
        let visualAnalysis = null;
        if (videoId) {
            const video = await prisma.video.findUnique({ where: { id: videoId } });
            if (video?.description) {
                try {
                    visualAnalysis = JSON.parse(video.description);
                } catch (e) {}
            }
            if (!visualAnalysis) {
                console.log(`[Summarize] Visual analysis not found for video ${videoId}. Running visual analyzer...`);
                visualAnalysis = await analyzeVideoVisually(videoId);
            }
        }

        if (videoId && isSpinOff) {
            console.log(`[Summarize] Performing Step 1 concept summary on long video transcript...`);
            const summaryPrompt = `You are a children's content director. Read the following ingested video transcript, and output a simple 1-paragraph abstracted, generic concept outline of the core events, character roles, and beats (e.g. "Character A wakes up, Character B greets him, they play in a fantasy cloud environment, they transition to an underwater scene and meet a funny sea animal, they sing together"). 
            DO NOT mention specific copyrighted nouns, names (like Cocomelon), or bizarre custom visual accessories (like a whale with a mustache or a cat dancing with a giraffe). Translate all events into generic character roles and actions so it acts as a clean, copyright-safe outline skeleton. Do NOT output dialogues, verses or songs. Make it plain, descriptive prose.`;
            
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
        const systemPrompt = `You are an expert children's content writer and a copyright compliance specialist. Read the following input (which is ${isSpinOff ? "a simple generic narrative premise outline" : "a story script"}), and rewrite it into a highly original storyboard script consisting of exactly ${numScenes} scenes.
 
CRITICAL COMPLIANCE RULES (COPYRIGHT PROTECTION & ORIGINALITY):
1. PROCEDURAL WHIMSICAL SUBSTITUTION: You are strictly forbidden from copying specific creative concept pairings, unusual whimsical characters, accessories, or settings from the source. 
   - If the source describes a highly specific or bizarre combination (e.g. a "whale with a mustache", "a cat dancing with a giraffe", "candy clouds", "an ice cream mountain", "a baby whale jumping off an atom"), you MUST dynamically substitute it with an entirely different, equally whimsical concept of your own creation (e.g. "a tiny squirrel wearing oversized glasses reading a map on a giant leaf", "a clumsy elephant trying to hula-hoop with a Saturn ring", "a forest of glowing musical mushrooms", "starry waterfalls").
   - Never copy specific nouns, adjectives, or action pairings verbatim from the source.
2. COMPLETE ORIGINALITY: Compose all dialogue and song lyrics entirely from scratch. Do NOT reuse existing song lyrics or word-for-word structures. Use completely different metaphors, rhyming patterns, and vocabularies to guarantee 100% legal safety.
3. Dialogue Pacing (type: "dialogue" ONLY): Write natural, engaging narration or dialogue. Do NOT stuff words just to fill time. The absolute maximum is ${maxWordCount} words per dialogue scene to prevent TTS audio from running longer than the video clip. Short, punchy lines (5-10 words) are preferred — let the animation carry the scene.
4. Song Lyrics (type: "song" ONLY): The word limit above does NOT apply to song scenes. Songs are played from a user-uploaded Suno MP3, so duration is handled externally. Write the COMPLETE song in a single scene — all verses, chorus, bridge, and repeated hooks as one continuous block of lyrics in the "text" field. A well-written song should have 3-6 verses minimum. NEVER split a single song across multiple scenes: one song = exactly one scene.
5. Director's Shot Brief: You are directing a camera crew who reads ONLY the current shot card — they have zero memory of any previous scene. Every "visualPrompt" must be a complete, self-contained director's brief that includes: (1) the style prefix "${stylePrefix}", (2) the character's name AND a brief physical description so the video model can identify them (e.g. "Buddy, a small orange tabby kitten with big green eyes"), (3) the specific action or motion happening in this shot (make it dynamic enough to fill ${defaultShotDuration || 5} seconds of video naturally), and (4) the setting/background. Think like a film director writing a shot card for a crew that has never seen the script.
6. Tone & Register: ${toneBrief}

CRITICAL COMPLIANCE RULES:
1. CAST ALIGNMENT — CHARACTER VISUAL IDENTITY:
You MUST ONLY use the following characters anywhere in the entire storyboard output — including speaker fields, dialogue text, AND visualPrompt scene descriptions. Never name, reference, or imply the existence of any character not in this list, regardless of any characters you may have encountered in source material or prior context. Background figures must be described generically (e.g. "a group of children", "nearby animals") without names. This rule is absolute — no exceptions for songs, imagination sequences, or dream scenes.

ANCHORED CHARACTERS (use this exact visual description in every visualPrompt they appear in — do not alter or invent variations):
${anchoredRoster || "(none)"}

FREE CHARACTERS (invent a specific vivid physical description on first use, then repeat it exactly in every scene — never vary it):
${freeRoster || "(none)"}`;


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

        // Bulletproof JSON block extractor: search for the first '[' and last ']'
        let jsonContent = content.trim();
        const firstBracket = jsonContent.indexOf("[");
        const lastBracket = jsonContent.lastIndexOf("]");
        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
            jsonContent = jsonContent.slice(firstBracket, lastBracket + 1);
        } else if (jsonContent.startsWith("```")) {
            jsonContent = jsonContent.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
        }

        try {
            const scenes = JSON.parse(jsonContent);
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
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
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
