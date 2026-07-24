import { buildKinematicPrompt } from "@/lib/ai/prompt-builder";
import { prisma } from "@/lib/prisma";

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

    // Step 1: Generate Master Show Blueprint + Full Cast Roster (Lightweight: 2048 max_tokens)
    const masterPrompt = `You are a Hollywood showrunner. Write a high-concept ${numEp}-episode TV series blueprint for:
Title: "${title}"
Genre: "${genre}"
SubStyle: "${params.subStyle || "default"}"
Premise: "${concept}"

CRITICAL RULES:
1. Define a Cast Roster containing ALL characters mentioned or implied in the premise (up to 10 characters). Include every protagonist, antagonist, family member, and key figure with vivid physical profiles.
2. Outline ${numEp} episodes with titles, loglines, and dramatic cliffhangers.

Return ONLY valid JSON matching this schema:
{
  "showTitle": "${title}",
  "genre": "${genre}",
  "subStyle": "${params.subStyle || "default"}",
  "premise": "${concept}",
  "cast": [
    {
      "name": "Character Name",
      "role": "PROTAGONIST",
      "physicalProfile": "Vivid description"
    }
  ],
  "episodes": [
    {
      "episodeNumber": 1,
      "title": "Episode 1: Title",
      "logline": "Episode summary",
      "cliffhanger": "Dramatic cliffhanger ending"
    }
  ]
}`;

    const masterRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: "deepseek-chat",
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: "You are a master cinematic showrunner. Return valid JSON only." },
                { role: "user", content: masterPrompt },
            ],
            temperature: 0.7,
            max_tokens: 2048,
        }),
    });

    if (!masterRes.ok) {
        const errText = await masterRes.text();
        throw new Error(`DeepSeek API Blueprint Generation Error (HTTP ${masterRes.status}): ${errText}`);
    }

    const masterData = await masterRes.json();
    let masterText = masterData.choices?.[0]?.message?.content?.trim() || "";
    if (masterText.startsWith("```")) {
        masterText = masterText.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const masterBlueprint: MiniSeriesOutput = JSON.parse(masterText);

    // Step 2: Generate Episode Screenplay in Chunks per Episode (Lightweight: 2048 max_tokens per Episode)
    const fullEpisodes: FilmEpisode[] = [];

    for (const epOutline of masterBlueprint.episodes || []) {
        const epPrompt = `You are a master cinematic director. Write the complete camera shot screenplay for Episode ${epOutline.episodeNumber}: "${epOutline.title}".
Show Title: "${masterBlueprint.showTitle}"
Genre: "${genre}"
Episode Logline: "${epOutline.logline}"
Cast Roster: ${JSON.stringify(masterBlueprint.cast)}

CRITICAL DRAMATIC SCENE RULES:
1. NO NARRATOR VOICEOVER. Story is driven 100% by character interaction, scene setup, action, and dialogue beats.
2. At least 30% of shots MUST be non-dialogue beats (wide environmental establishing shots, camera movement cuts, facial reactions, atmospheric mood).
3. Scenes MUST follow a 5-beat dramatic arc: Atmosphere ➔ Baseline Entrance ➔ Inciting Tension ➔ Escalation/Climax ➔ Reaction/Transition.
4. If this is Episode 1, you MUST establish the world, setting, and baseline character state before any conflict or suspicion begins.
5. Write 12 to 18 visual shots for this episode.

For each shot specify:
- "shotIndex": 1, 2, 3...
- "shotType": e.g. "wide shot", "medium shot", "close-up", "over-the-shoulder", "action cut"
- "speakerName": Character speaking (leave null/empty if non-dialogue establishing beat)
- "dialogueLine": Character spoken line (with emotional tag like [determined], [shocked], [whispering])
- "actionDescription": Physical character action, facial expression, and movement
- "environment": Lighting, background setting, and visual mood
- "cameraMovement": Dynamic motion (e.g. "slow crane push-in", "whip pan", "static tight lens")

Return ONLY valid JSON matching this schema:
{
  "episodeNumber": ${epOutline.episodeNumber},
  "title": "${epOutline.title}",
  "logline": "${epOutline.logline}",
  "cliffhanger": "${epOutline.cliffhanger}",
  "shots": [
    {
      "shotIndex": 1,
      "shotType": "wide shot",
      "speakerName": null,
      "dialogueLine": null,
      "actionDescription": "Camera gliding past ornate chandeliers, guests mingling in formal attire",
      "environment": "Grand estate ballroom at sunset, warm amber lighting",
      "cameraMovement": "slow crane tracking push-in"
    }
  ]
}`;

        const epRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: "You are a master cinematic director. Return valid JSON only." },
                    { role: "user", content: epPrompt },
                ],
                temperature: 0.7,
                max_tokens: 2048,
            }),
        });

        if (!epRes.ok) {
            const errText = await epRes.text();
            throw new Error(`DeepSeek API Episode ${epOutline.episodeNumber} Generation Error (HTTP ${epRes.status}): ${errText}`);
        }

        const epData = await epRes.json();
        let epText = epData.choices?.[0]?.message?.content?.trim() || "";
        if (epText.startsWith("```")) {
            epText = epText.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
        }

        const epResult: FilmEpisode = JSON.parse(epText);
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
            const kinematicPrompt = buildKinematicPrompt({
                aspectRatio: "16:9",
                shotType: s.shotType || "medium shot",
                subject: `${s.speakerName ? s.speakerName + ' (' + charDesc + ')' : 'Cinematic Scene'}`,
                action: s.actionDescription || "moving dynamically in frame",
                environment: `${s.environment || "cinematic scene"} with soft cinematic lighting`,
                cameraMovement: s.cameraMovement || "slow push-in",
                lighting: "cinematic lighting",
                modelType: "wan2.3"
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
