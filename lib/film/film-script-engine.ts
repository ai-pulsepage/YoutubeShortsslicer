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
    const targetEpMins = params.targetEpisodeMinutes || 3;
    const shotsPerEp = params.shotsPerEpisode || Math.max(5, Math.round((targetEpMins * 60) / 5));
    const targetVideoModel = params.videoModel || "wan2.3";
    const targetVoiceEngine = params.voiceEngine || "cosyvoice2";

    let apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        apiKey = (await getDbApiKey("deepseek_api_key")) || "";
    }

    // Build a narrative arc blueprint so the AI knows each episode's role in the full series
    const buildArcBlueprint = (n: number): string => {
        if (n === 1) return `Episode 1 (FULL FEATURE FILM): Setup → Rising Action → Climax → Resolution. Self-contained, epic finale.`;
        if (n === 2) return [
            `Episode 1 (PREMIERE): Introduce world, cast, central conflict. End on shocking hook.`,
            `Episode 2 (SERIES FINALE): Escalate to maximum tension. Resolve all major arcs. Deliver a powerful, emotionally satisfying or devastatingly tragic ending.`
        ].join("\n");

        const lines: string[] = [];
        for (let i = 1; i <= n; i++) {
            if (i === 1) lines.push(`Episode 1 (SERIES PREMIERE): Establish the world, introduce every major character, plant the central conflict. End with a compelling hook that demands the next episode.`);
            else if (i === 2) lines.push(`Episode 2 (RISING ACTION): Deepen relationships, reveal a secondary threat or betrayal. Escalate stakes. End with a mid-point twist.`);
            else if (i === n - 1 && n >= 4) lines.push(`Episode ${i} (PENULTIMATE): Maximum tension. Every character's loyalty is tested. The villain seems to have won. End on a devastating cliffhanger.`);
            else if (i === n) lines.push(`Episode ${n} (SERIES FINALE): All threads converge. Deliver an emotionally resonant or shocking conclusion. Resolve protagonist arc. Optional: season-ending twist for potential renewal.`);
            else lines.push(`Episode ${i} (ACT ${i} — ESCALATION): Push conflict forward. Reveal a new secret or betrayal. Each episode must raise the stakes from the last.`);
        }
        return lines.join("\n");
    };

    const arcBlueprint = buildArcBlueprint(numEp);

    const systemPrompt = `You are a Hollywood showrunner and master cinematic director.
Write a high-concept ${numEp}-episode TV Mini-Series script for the following concept:
Title: ${title}
Genre: ${genre}
Concept: ${concept}

SERIES ARC BLUEPRINT — You MUST follow this narrative plan episode-by-episode:
${arcBlueprint}

CRITICAL RULES:
1. NO NARRATOR VOICEOVER. The story is driven 100% by character dialogue, character action beats, and emotional conflict.
2. Define a Cast Roster of 2 to 4 vivid characters with physical profiles.
3. Write ${numEp} episodes. Each episode must have EXACTLY ${shotsPerEp} consecutive visual shots.
4. The final episode MUST resolve the central conflict. Do NOT leave the main story open-ended.
5. Each shot must specify:
   - "shotType": e.g. "close-up", "medium shot", "over-the-shoulder", "action cut"
   - "speakerName": Character speaking (if dialogue beat)
   - "dialogueLine": Character spoken line (with emotional tag like [excited], [angry], [whispering])
   - "actionDescription": Physical character action, facial expression, and movement
   - "environment": Lighting, background setting, and visual mood
   - "cameraMovement": Dynamic motion (e.g. "fast whip-pan", "slow tracking push-in")

Return ONLY valid JSON matching this schema:
{
  "showTitle": "${title}",
  "genre": "${genre}",
  "subStyle": "${params.subStyle || "default"}",
  "premise": "${concept}",
  "seriesArc": "One sentence describing the full arc from premiere to finale",
  "cast": [
    {
      "name": "Character Name",
      "role": "PROTAGONIST",
      "physicalProfile": "Vivid physical description verbatim"
    }
  ],
  "episodes": [
    {
      "episodeNumber": 1,
      "episodeRole": "PREMIERE",
      "title": "Episode 1: Title",
      "logline": "Episode summary",
      "cliffhanger": "Dramatic cliffhanger ending",
      "shots": [
        {
          "shotIndex": 1,
          "shotType": "medium shot",
          "speakerName": "Hero Name",
          "dialogueLine": "[angry] You were the one who betrayed the clan!",
          "actionDescription": "Hero drawing wooden staff, stepping forward into combat stance",
          "environment": "ancient temple courtyard at sunset, swirling autumn leaves",
          "cameraMovement": "whip pan to face"
        }
      ]
    }
  ]
}`;

    let rawOutput: any = null;

    if (apiKey) {
        try {
            const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: `Generate the complete ${numEp}-episode series for: "${title}". Follow the arc blueprint exactly. Return only valid JSON.` },
                    ],
                    temperature: 0.8,
                    max_tokens: 8000,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                let text = data.choices?.[0]?.message?.content?.trim() || "";
                if (text.startsWith("```")) {
                    text = text.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
                }
                try {
                    rawOutput = JSON.parse(text);
                } catch {
                    // Attempt light repair for common truncation issues
                    try { rawOutput = JSON.parse(text + "}]}"); } catch { /* fall through to template */ }
                }
            }
        } catch (err: any) {
            console.warn("[Film Script Engine] DeepSeek generation error, using fallback template:", err.message);
        }
    }

    // Fallback template if AI call unavailable
    if (!rawOutput) {
        rawOutput = {
            showTitle: title,
            genre,
            subStyle: params.subStyle || "default",
            premise: concept,
            cast: [
                { name: "Protagonist", role: "PROTAGONIST", physicalProfile: "Intense eyes, dark leather jacket, determined expression" },
                { name: "Antagonist", role: "ANTAGONIST", physicalProfile: "Sharp suit, cold calculating gaze, metallic cybernetic eye" }
            ],
            episodes: Array.from({ length: numEp }).map((_, epIdx) => ({
                episodeNumber: epIdx + 1,
                title: `Episode ${epIdx + 1}: The Rising Shadow`,
                logline: `The conflict escalates as secrets emerge in episode ${epIdx + 1}.`,
                cliffhanger: "A shocking betrayal leaves the hero trapped.",
                shots: [
                    {
                        shotIndex: 1,
                        shotType: "wide shot",
                        speakerName: "Protagonist",
                        dialogueLine: "[determined] We don't have much time left...",
                        actionDescription: "looking out over neon-lit rooftop rain, clenching fist",
                        environment: "dark futuristic metropolis rooftop, neon light reflections",
                        cameraMovement: "slow crane push-in"
                    },
                    {
                        shotIndex: 2,
                        shotType: "close-up",
                        speakerName: "Antagonist",
                        dialogueLine: "[smirking] You're already too late.",
                        actionDescription: "stepping out from shadow, illuminating cybernetic eye",
                        environment: "dimly lit rain alleyway with glowing holographic signs",
                        cameraMovement: "static intense hero shot"
                    }
                ]
            }))
        };
    }

    // Format every shot into Kinematic Natural Prose using buildKinematicPrompt
    const castMap = new Map<string, string>();
    (rawOutput.cast || []).forEach((c: any) => castMap.set(c.name, c.physicalProfile));

    const processedEpisodes: FilmEpisode[] = (rawOutput.episodes || []).map((ep: any) => ({
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
                environment: s.environment || "cinematic dramatic scene",
                cameraMovement: s.cameraMovement || "gentle push-in",
                stylePreset: `${genre}, 4k film quality, dramatic movie lighting`
            });

            return {
                shotIndex: sIdx + 1,
                shotType: s.shotType || "medium shot",
                speakerName: s.speakerName,
                dialogueLine: s.dialogueLine,
                actionDescription: s.actionDescription,
                kinematicPrompt
            };
        })
    }));

    return {
        showTitle: rawOutput.showTitle || title,
        genre: rawOutput.genre || genre,
        subStyle: rawOutput.subStyle || "default",
        premise: rawOutput.premise || concept,
        cast: rawOutput.cast || [],
        episodes: processedEpisodes
    };
}
