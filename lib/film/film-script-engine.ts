import { buildKinematicPrompt } from "@/lib/ai/prompt-builder";
import { prisma } from "@/lib/prisma";
import { logAiActivity } from "@/lib/logging/ai-logger";

export interface CharacterActor {
    name: string;
    role: "PROTAGONIST" | "ANTAGONIST" | "MENTOR" | "SIDEKICK" | "EXTRA";
    physicalProfile: string;
    voiceEngine?: string;
    voiceId?: string;
}

export interface FilmShot {
    shotIndex: number;
    shotType: "wide shot" | "medium shot" | "close-up" | "over-the-shoulder" | "tracking shot" | "action cut";
    speakerName?: string;
    dialogueLine?: string;
    actionDescription: string;
    kinematicPrompt: string;
    cameraAngle?: string;
    cameraMovement?: string;
    mood?: string;
    lighting?: string;
}

export interface FilmScene {
    sceneNumber: number;
    location: string;
    description: string;
    shots: FilmShot[];
}

export interface FilmEpisode {
    episodeNumber: number;
    title: string;
    logline: string;
    cliffhanger: string;
    scenes?: FilmScene[];
    shots: FilmShot[];
}

export interface MiniSeriesOutput {
    showTitle: string;
    genre: string;
    subStyle: string;
    premise: string;
    cast: CharacterActor[];
    episodes: FilmEpisode[];
}

// Robust repair for truncated JSON outputs from AI models
function repairTruncatedJson<T = any>(rawText: string): { data: T; repaired: boolean } {
    let cleanText = rawText.trim();
    if (cleanText.startsWith("```")) {
        cleanText = cleanText.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
    }

    try {
        const data = JSON.parse(cleanText);
        return { data, repaired: false };
    } catch {
        let fixed = cleanText;
        const lastObjectEnd = fixed.lastIndexOf("}");
        if (lastObjectEnd > 0) {
            fixed = fixed.substring(0, lastObjectEnd + 1);
        }

        let openBrackets = 0;
        let openBraces = 0;
        let inString = false;
        let escapeNext = false;

        for (let i = 0; i < fixed.length; i++) {
            const char = fixed[i];
            if (escapeNext) { escapeNext = false; continue; }
            if (char === "\\") { escapeNext = true; continue; }
            if (char === '"') { inString = !inString; continue; }
            if (!inString) {
                if (char === "{") openBraces++;
                else if (char === "}") openBraces = Math.max(0, openBraces - 1);
                else if (char === "[") openBrackets++;
                else if (char === "]") openBrackets = Math.max(0, openBrackets - 1);
            }
        }

        if (inString) fixed += '"';
        while (openBrackets > 0) { fixed += "]"; openBrackets--; }
        while (openBraces > 0) { fixed += "}"; openBraces--; }

        try {
            const data = JSON.parse(fixed);
            return { data, repaired: true };
        } catch {
            const shotsMatch = [...cleanText.matchAll(/\{[^{}]*"shotIndex"[^{}]*\}/g)];
            if (shotsMatch.length > 0) {
                const recoveredShots = shotsMatch.map(m => {
                    try { return JSON.parse(m[0]); } catch { return null; }
                }).filter(Boolean);
                
                return {
                    data: { shots: recoveredShots } as any,
                    repaired: true
                };
            }
            throw new Error(`Unrepairable JSON output from AI (truncated at char ${cleanText.length})`);
        }
    }
}

// Helper to query DB API keys
async function getDbApiKey(service: string): Promise<string | null> {
    try {
        const dbKey = await prisma.apiKey.findUnique({ where: { service } });
        if (dbKey?.key) {
            return Buffer.from(dbKey.key, "base64").toString("utf8");
        }
    } catch {}
    return null;
}

/**
 * Generates a full Multi-Episode TV Mini-Series or Feature Film script
 * driven 100% by character dialogue, inter-character conflict, and action mechanics (No narrator).
 */
export async function generateCinematicShow(params: {
    title: string;
    concept: string;
    genre: "romance_telenovela" | "anthropomorphic_animal" | "kung_fu_classics" | "dystopian_scifi" | "horror" | "true_crime";
    subStyle?: string;
    numEpisodes?: number;
    targetEpisodeMinutes?: number;
    shotsPerEpisode?: number;
    videoModel?: string;
    voiceEngine?: string;
}): Promise<MiniSeriesOutput> {
    const { title, concept, genre } = params;
    const numEp = params.numEpisodes || 3;
    const targetVideoModel = params.videoModel || "wan2.3";

    let apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        apiKey = (await getDbApiKey("deepseek_api_key")) || "";
    }

    if (!apiKey) {
        throw new Error("DeepSeek API key is missing. Please configure your DeepSeek API key in Admin Settings.");
    }

    // Step 1: Generate Master Show Blueprint + Full Cast Roster (Lightweight & Precise)
    const masterPrompt = `You are a Hollywood showrunner. Write a high-concept ${numEp}-episode TV series blueprint for:
Title: "${title}"
Genre: "${genre}"
SubStyle: "${params.subStyle || "default"}"
Premise & Context: "${concept}"

CRITICAL RULES:
1. Summarize the series premise into a clean 1 to 2 sentence summary in "premise".
2. Define a Cast Roster containing ALL characters mentioned or implied (up to 10 characters). Include every protagonist, antagonist, family member, and key figure with concise physical profiles.
3. You MUST outline ALL ${numEp} episodes with titles, loglines, and dramatic cliffhangers.
4. IF THE USER PROMPT SPECIFIES AN EPISODE ARC (e.g., Ep. 1, Ep. 2, Ep. 3...), YOU MUST STRICTLY KEEP EACH EPISODE'S EVENTS SEPARATED EXACTLY AS DEFINED BY THE USER! Episode 1 MUST contain ONLY Episode 1's events (e.g. engagement party & lingering look). Do NOT pull forward plot events or private confrontations from Episode 2 into Episode 1's logline!

Return ONLY valid JSON matching this schema:
{
  "showTitle": "${title}",
  "genre": "${genre}",
  "subStyle": "${params.subStyle || "default"}",
  "premise": "Clean 1-sentence overview of the series arc",
  "cast": [
    {
      "name": "Character Name",
      "role": "PROTAGONIST",
      "physicalProfile": "Vivid physical description"
    }
  ],
  "episodes": [
    {
      "episodeNumber": 1,
      "title": "Episode 1: Title",
      "logline": "1-sentence episode summary",
      "cliffhanger": "Dramatic cliffhanger ending"
    }
  ]
}`;

    logAiActivity("MASTER_BLUEPRINT_REQUEST", {
        promptTitle: title,
        systemPrompt: "You are a master cinematic showrunner. Return valid JSON only.",
        userPrompt: masterPrompt
    });

    const deepseekModel = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";

    const masterRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: deepseekModel,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: "You are a master cinematic showrunner. Return valid JSON only." },
                { role: "user", content: masterPrompt },
            ],
            temperature: 0.7,
            max_tokens: 4096,
        }),
    });

    if (!masterRes.ok) {
        const errText = await masterRes.text();
        logAiActivity("MASTER_BLUEPRINT_ERROR", { promptTitle: title, error: errText });
        throw new Error(`DeepSeek API Blueprint Generation Error (HTTP ${masterRes.status}): ${errText}`);
    }

    const masterData = await masterRes.json();
    const masterText = masterData.choices?.[0]?.message?.content?.trim() || "";

    logAiActivity("MASTER_BLUEPRINT_RESPONSE", {
        promptTitle: title,
        rawResponse: masterText
    });

    const { data: masterBlueprint, repaired: blueprintRepaired } = repairTruncatedJson<MiniSeriesOutput>(masterText);
    if (blueprintRepaired) {
        logAiActivity("MASTER_BLUEPRINT_REPAIRED", { promptTitle: title, repaired: true });
    }

    // Step 2: Generate Episode Screenplay in Chunks per Episode (4096 max_tokens per Episode)
    const fullEpisodes: FilmEpisode[] = [];
    const targetEpisodeMins = params.targetEpisodeMinutes || 3;
    const targetShots = Math.max(18, Math.round((targetEpisodeMins * 60) / 5));

    for (const epOutline of masterBlueprint.episodes || []) {
        const epPrompt = `You are a master cinematic director. Write the complete camera shot screenplay for Episode ${epOutline.episodeNumber}: "${epOutline.title}".
Show Title: "${masterBlueprint.showTitle}"
Genre: "${genre}"
Episode Logline: "${epOutline.logline}"
Cast Roster: ${JSON.stringify(masterBlueprint.cast)}

CRITICAL DRAMATIC SCENE RULES:
1. NO NARRATOR VOICEOVER. Story is driven 100% by character interaction, scene setup, action, and dialogue beats.
2. At least 30% of shots MUST be non-dialogue beats (wide environmental establishing shots, camera movement cuts, facial reactions, atmospheric mood).
3. ${epOutline.episodeNumber === 1
    ? "Follow a Pilot Arc: Estate Atmosphere ➔ Character Baseline ➔ Inciting Tension ➔ Escalation ➔ Cliffhanger."
    : `Follow a Continuance Arc: Cold Open at Logline Location ➔ Immediate Inciting Action/Confrontation ➔ Escalation ➔ Climax ➔ Cliffhanger. STRICT RULE: Do NOT include party re-introductions, guest mingling, or baseline entrances. Jump IMMEDIATELY into the specific location and conflict of Episode ${epOutline.episodeNumber}'s logline.`
}
4. ${epOutline.episodeNumber === 1
    ? `Episode 1 MUST focus ONLY on its logline: "${epOutline.logline}". End Episode 1 with the cliffhanger: "${epOutline.cliffhanger}". Do NOT include private study confrontations or accusations that belong to Episode 2!`
    : `Episode ${epOutline.episodeNumber} MUST start at its own UNIQUE location matching its logline: "${epOutline.logline}". Do NOT repeat establishing shots, scenes, or dialogue from Episode ${epOutline.episodeNumber - 1}!`
}
5. You MUST write EXACTLY ${targetShots} visual shots for this episode to fill the ${targetEpisodeMins}-minute runtime target.
6. For extended episodes (${targetShots} shots), divide the episode across 3 to 4 distinct sub-locations (e.g. Sub-Scene A, Sub-Scene B, Sub-Scene C) that advance the narrative. Every spoken exchange MUST reveal new information or escalate conflict without repeating arguments.

For each shot specify:
- "shotIndex": 1, 2, 3...
- "shotType": e.g. "wide shot", "medium shot", "close-up", "over-the-shoulder", "action cut"
- "speakerName": Character speaking (leave null/empty if non-dialogue establishing beat)
- "dialogueLine": Character spoken line (with emotional tag like [determined], [low, measured], [whispering])
- "actionDescription": Physical character action, facial expression, and movement
- "environment": Lighting, background setting, and visual mood matching this episode's location
- "cameraMovement": Dynamic motion (e.g. "slow crane push-in", "whip pan", "static tight lens")

Return ONLY valid JSON matching this schema:
{
  "episodeNumber": ${epOutline.episodeNumber},
  "title": "${epOutline.title}",
  "logline": "${epOutline.logline}",
  "cliffhanger": "${epOutline.cliffhanger}",
  "shots": []
}`;

        logAiActivity(`EPISODE_${epOutline.episodeNumber}_REQUEST`, {
            promptTitle: `${masterBlueprint.showTitle} - Episode ${epOutline.episodeNumber}`,
            systemPrompt: "You are a master cinematic director. Return valid JSON only.",
            userPrompt: epPrompt
        });

        const epRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: deepseekModel,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: "You are a master cinematic director. Return valid JSON only." },
                    { role: "user", content: epPrompt },
                ],
                temperature: 0.7,
                max_tokens: 4096,
            }),
        });

        if (!epRes.ok) {
            const errText = await epRes.text();
            logAiActivity(`EPISODE_${epOutline.episodeNumber}_ERROR`, {
                promptTitle: `${masterBlueprint.showTitle} - Episode ${epOutline.episodeNumber}`,
                error: errText
            });
            throw new Error(`DeepSeek API Episode ${epOutline.episodeNumber} Generation Error (HTTP ${epRes.status}): ${errText}`);
        }

        const epData = await epRes.json();
        const epText = epData.choices?.[0]?.message?.content?.trim() || "";

        logAiActivity(`EPISODE_${epOutline.episodeNumber}_RESPONSE`, {
            promptTitle: `${masterBlueprint.showTitle} - Episode ${epOutline.episodeNumber}`,
            rawResponse: epText
        });

        const { data: epResult, repaired: epRepaired } = repairTruncatedJson<FilmEpisode>(epText);
        if (epRepaired) {
            logAiActivity(`EPISODE_${epOutline.episodeNumber}_REPAIRED`, {
                promptTitle: `${masterBlueprint.showTitle} - Episode ${epOutline.episodeNumber}`,
                repaired: true
            });
        }

        fullEpisodes.push(epResult);
    }

    masterBlueprint.episodes = fullEpisodes;

    // Step 3: Format every shot into Kinematic Natural Prose using buildKinematicPrompt
    const castMap = new Map<string, string>();
    (masterBlueprint.cast || []).forEach((c: any) => castMap.set(c.name, c.physicalProfile));

    const processedEpisodes: FilmEpisode[] = (masterBlueprint.episodes || []).map((ep: any) => ({
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        logline: ep.logline,
        cliffhanger: ep.cliffhanger,
        shots: (ep.shots || []).map((s: any, sIdx: number) => {
            const charDesc = castMap.get(s.speakerName || "") || s.speakerName || "Character";
            const rawDialogue = s.dialogueLine || "";
            const emotionTag = rawDialogue.match(/\[(.*?)\]/)?.[1] || "";
            const cleanSpokenText = rawDialogue.replace(/\[.*?\]/g, "").trim();

            const dialoguePromptPart = cleanSpokenText
                ? ` speaking ${emotionTag ? 'in a ' + emotionTag + ' tone: ' : ''}"${cleanSpokenText}"`
                : "";

            const kinematicPrompt = buildKinematicPrompt({
                aspectRatio: "16:9",
                shotType: s.shotType || "medium shot",
                subject: `${s.speakerName ? s.speakerName + ' (' + charDesc + ')' + dialoguePromptPart : 'Cinematic Scene'}`,
                action: s.actionDescription || "moving dynamically in frame",
                environment: `${s.environment || "cinematic scene"} with soft cinematic lighting`,
                cameraMovement: s.cameraMovement || "slow push-in",
                lighting: "cinematic lighting",
                modelType: (targetVideoModel as any) || "wan2.3"
            });

            return {
                shotIndex: s.shotIndex || sIdx + 1,
                shotType: s.shotType || "medium shot",
                speakerName: s.speakerName || undefined,
                dialogueLine: s.dialogueLine || undefined,
                actionDescription: s.actionDescription || "",
                kinematicPrompt: kinematicPrompt,
                cameraAngle: s.cameraAngle || "eye level",
                cameraMovement: s.cameraMovement || "gentle push-in",
                environment: s.environment || "",
            };
        })
    }));

    return {
        showTitle: masterBlueprint.showTitle || title,
        genre: masterBlueprint.genre || genre,
        subStyle: params.subStyle || "default",
        premise: masterBlueprint.premise || concept,
        cast: masterBlueprint.cast || [],
        episodes: processedEpisodes
    };
}
