import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

    const { projectId, targetLanguage } = await req.json();
    if (!projectId || !targetLanguage) {
        return NextResponse.json({ error: "projectId and targetLanguage are required" }, { status: 400 });
    }

    try {
        // 1. Fetch the source project
        const sourceProj = await prisma.documentary.findUnique({
            where: { id: projectId },
            include: {
                assets: { where: { type: "CHARACTER" } },
                scenes: { orderBy: { sceneIndex: "asc" } }
            }
        });

        if (!sourceProj) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        // Parse scenes
        const parsedScenes = sourceProj.scenes.map(s => {
            let character = "Leo";
            let voice = "en-US-AnaNeural-Female";
            let type = s.sceneIndex % 3 === 2 ? "song" : "dialogue";
            let visualPrompt = s.searchQueries || "";
            let sunoStylePrompt = "";
            let visualShots = [];

            try {
                if (s.searchQueries && s.searchQueries.startsWith("{")) {
                    const meta = JSON.parse(s.searchQueries);
                    if (meta.character) character = meta.character;
                    if (meta.voice) voice = meta.voice;
                    if (meta.type) type = meta.type;
                    if (meta.visualPrompt !== undefined) visualPrompt = meta.visualPrompt;
                    if (meta.sunoStylePrompt) sunoStylePrompt = meta.sunoStylePrompt;
                    if (meta.visualShots) visualShots = meta.visualShots;
                }
            } catch (e) {
                // Ignore
            }

            return {
                id: s.id,
                type,
                character,
                voice,
                text: s.narrationText || "",
                visualPrompt,
                sunoStylePrompt,
                visualShots,
                visualPath: s.assembledPath || undefined
            };
        });

        let apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            const dbKey = await prisma.apiKey.findUnique({ where: { service: "deepseek_api_key" } });
            if (dbKey?.key) apiKey = Buffer.from(dbKey.key, "base64").toString("utf8");
        }

        const langLower = targetLanguage.toLowerCase().trim();
        const mappedVoiceObj = LANGUAGE_VOICES[langLower] || {
            childFemale: "en-US-AnaNeural-Female",
            male: "en-US-GuyNeural-Male",
            default: "en-US-AnaNeural-Female"
        };

        let translatedTitle = `${sourceProj.title || "Kids Story"} - ${targetLanguage} Version`;
        let translatedScript = sourceProj.script || "";
        let translatedScenes = parsedScenes;

        if (apiKey) {
            const systemPrompt = `You are a professional children's TV translation expert. Translate the storyboard texts into fluent, child-friendly, rhythmic ${targetLanguage}.
CRITICAL RULES:
1. Translate the project script premise and all scene dialogue texts/song lyrics.
2. For all "song" scenes, rewrite the lyrics poetically to keep a natural, rhythmic sing-along style in the target language.
3. Automatically choose local voice tags: use "${mappedVoiceObj.childFemale}" for female/child characters and "${mappedVoiceObj.male}" for male characters.
4. Keep the visual prompts, sunoStylePrompts, and IDs exactly the same as in the input.

Return ONLY a valid JSON object matching this schema, no markdown wrapping:
{
  "title": "Translated Project Title",
  "script": "Translated story premise/script description",
  "scenes": [
    {
      "id": "original-id",
      "type": "dialogue" | "song",
      "character": "character name",
      "voice": "remappedLocalizedVoiceTag",
      "text": "Translated dialog/lyrics text in ${targetLanguage}",
      "visualPrompt": "keep original prompt",
      "sunoStylePrompt": "keep original suno style prompt",
      "visualShots": [
        {
          "id": "shot-id",
          "primaryCharacter": "character",
          "visualPrompt": "keep original shot prompt"
        }
      ]
    }
  ]
}`;

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
                        { role: "user", content: JSON.stringify({ title: sourceProj.title, script: sourceProj.script, scenes: parsedScenes }) }
                    ],
                    temperature: 0.7,
                    max_tokens: 3000
                })
            });

            if (!res.ok) {
                const errText = await res.text();
                if (res.status === 402 || errText.toLowerCase().includes("insufficient_balance")) {
                    return NextResponse.json({ error: "DEEPSEEK_OUT_OF_FUNDS", details: "DeepSeek API: Insufficient Balance." }, { status: 402 });
                }
                throw new Error(`DeepSeek API returned ${res.status}`);
            }

            const data = await res.json();
            let content = data.choices?.[0]?.message?.content?.trim() || "";

            if (content.startsWith("```")) {
                content = content.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
            }

            try {
                const parsedResult = JSON.parse(content);
                if (parsedResult.title) translatedTitle = parsedResult.title;
                if (parsedResult.script) translatedScript = parsedResult.script;
                if (parsedResult.scenes) {
                    // Match visualPaths from source
                    translatedScenes = parsedResult.scenes.map((ts: any) => {
                        const original = parsedScenes.find(os => os.id === ts.id);
                        // Map shot visual paths from original so videos carry over!
                        const visualShots = (ts.visualShots || []).map((shot: any) => {
                            const origShot = original?.visualShots?.find((os: any) => os.visualPrompt === shot.visualPrompt || os.id === shot.id);
                            return {
                                ...shot,
                                visualPath: origShot?.visualPath || undefined
                            };
                        });

                        return {
                            ...ts,
                            visualPath: original?.visualPath || undefined,
                            narrationPath: undefined, // regenerate translations voices
                            visualShots
                        };
                    });
                }
            } catch (err) {
                console.error("[Translation] Failed to parse DeepSeek JSON, using basic remappings:", err);
            }
        }

        // 2. Clone project in Database
        const clonedProject = await prisma.documentary.create({
            data: {
                userId: session.user.id,
                title: translatedTitle,
                script: translatedScript,
                genre: "children",
                status: "DRAFT"
            }
        });

        // 3. Clone Character Assets
        for (const char of sourceProj.assets) {
            await prisma.docAsset.create({
                data: {
                    documentaryId: clonedProject.id,
                    type: "CHARACTER",
                    label: char.label,
                    prompt: char.prompt,
                    imagePath: char.imagePath || null
                }
            });
        }

        // 4. Create Translated Timeline Scenes
        for (let idx = 0; idx < translatedScenes.length; idx++) {
            const s = translatedScenes[idx];
            const serializedMeta = JSON.stringify({
                visualPrompt: s.visualPrompt,
                character: s.character,
                voice: s.voice || mappedVoiceObj.default,
                type: s.type,
                sunoStylePrompt: s.sunoStylePrompt || "",
                visualShots: s.visualShots || []
            });

            await prisma.docScene.create({
                data: {
                    documentaryId: clonedProject.id,
                    sceneIndex: idx,
                    title: `Scene ${idx + 1}`,
                    narrationText: s.text,
                    searchQueries: serializedMeta,
                    assembledPath: s.visualPath || null,
                    narrationPath: null // clear english narration paths
                }
            });
        }

        console.log(`[Translate] Successfully cloned and translated project: ${clonedProject.id}`);
        return NextResponse.json({ success: true, projectId: clonedProject.id });

    } catch (err: any) {
        console.error("[Translate] Process failed:", err.message);
        return NextResponse.json({ error: "Translation failed", details: err.message }, { status: 500 });
    }
}
