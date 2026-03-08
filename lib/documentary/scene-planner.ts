/**
 * Scene Planner — The AI Filmmaker
 * 
 * Takes a documentary script and breaks it into scenes, each with a
 * professional shot list. Acts as both director and cinematographer,
 * planning camera angles, movements, mood, lighting, and transitions.
 * 
 * Also identifies all unique assets (characters, props, concepts, environments)
 * and maps them to shots via the DocShotAsset junction.
 */

import { prisma } from "@/lib/prisma";
import type { StoryScript, ScriptSegment } from "./story-writer";

// Types for the AI response
interface PlannedScene {
    title: string;
    narrationText: string;
    estimatedDuration: number;
    shots: PlannedShot[];
}

interface PlannedShot {
    shotType: string;
    cameraAngle: string;
    cameraMovement: string;
    action: string;
    mood: string;
    lighting: string;
    colorPalette: string;
    transitionIn: string;
    transitionOut: string;
    duration: number;
    assetsUsed: string[]; // labels referencing the asset list
}

interface PlannedAsset {
    label: string;
    type: "CHARACTER" | "PROP" | "CONCEPT" | "ENVIRONMENT" | "FILLER";
    description: string;
    attire?: string;
}

interface ScenePlan {
    scenes: PlannedScene[];
    assets: PlannedAsset[];
}

const SCENE_PLANNER_PROMPT = `You are an expert filmmaker and cinematographer planning a documentary.

Given the following script, break it into scenes and create a professional shot list.

SCRIPT:
{script}

STYLE GUIDE: {style}

Create a detailed production plan in JSON format:

{
  "assets": [
    {
      "label": "Unique name (e.g. 'Astronomer Dr. Chen', 'CERN Control Room')",
      "type": "CHARACTER | PROP | CONCEPT | ENVIRONMENT | FILLER",
      "description": "Detailed visual description for image generation",
      "attire": "Clothing/appearance details (for CHARACTER type only)"
    }
  ],
  "scenes": [
    {
      "title": "Scene title",
      "narrationText": "Full narration for this scene",
      "estimatedDuration": 45,
      "shots": [
        {
          "shotType": "establishing | wide | medium | close-up | extreme-close-up | over-shoulder | POV | insert | reaction | aerial",
          "cameraAngle": "eye-level | low-angle | high-angle | bird's-eye | dutch-angle | worm's-eye",
          "cameraMovement": "static | pan-left | pan-right | tilt-up | tilt-down | dolly-in | dolly-out | tracking | crane-up | crane-down | handheld | steadicam",
          "action": "Brief description of what happens in this shot",
          "mood": "mysterious | tense | awe | wonder | calm | dramatic | playful | ominous | reverent | hopeful",
          "lighting": "natural | dramatic | low-key | high-key | neon | golden-hour | fluorescent | moonlit | starlit | cinematic",
          "colorPalette": "Dominant colors (e.g. 'deep blues and silver')",
          "transitionIn": "cut | fade-in | dissolve | wipe",
          "transitionOut": "cut | fade-out | dissolve | wipe",
          "duration": 5,
          "assetsUsed": ["Asset Label 1", "Asset Label 2"]
        }
      ]
    }
  ]
}

RULES FOR SHOT PLANNING:
1. Each scene should have 3-8 shots for visual variety
2. Start scenes with establishing/wide shots, then move closer
3. Use insert shots for key objects and concepts
4. Use reaction shots after revelations
5. Vary camera movements — don't make everything static
6. Match mood/lighting to the emotional tone of the narration
7. Transitions: use dissolves between scenes, cuts within scenes
8. Abstract concepts (dark matter, quantum) should get CONCEPT assets with creative visual descriptions
9. Characters should be consistent — reuse the same asset label across scenes
10. Environments can have multiple variations (e.g., "CERN Exterior" vs "CERN Lab Interior")
11. Include filler assets for scene transitions (abstract art, particle effects, starfields)
12. Each shot should be 3-8 seconds for documentary pacing

Return ONLY valid JSON.`;

/**
 * Plans scenes and shots for a documentary script
 */
export async function planScenes(
    documentaryId: string,
    script: StoryScript,
    style: string = "cinematic"
): Promise<void> {
    const apiKey = await getApiKey();

    // Compile script text for the prompt
    const scriptText = script.segments
        .map((seg) => `[${seg.timestamp}] ${seg.narration}\n[VISUAL: ${seg.visualCue}]`)
        .join("\n\n");

    const prompt = SCENE_PLANNER_PROMPT
        .replace("{script}", scriptText)
        .replace("{style}", style);

    console.log(`[ScenePlanner] Planning scenes for "${script.title}"...`);

    const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
                {
                    role: "system",
                    content:
                        "You are an expert documentary filmmaker and cinematographer. Plan each scene with professional shot lists. Return only valid JSON.",
                },
                { role: "user", content: prompt },
            ],
            temperature: 0.7,
            max_tokens: 16000,
            response_format: { type: "json_object" },
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`DeepSeek API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
        throw new Error("Empty response from DeepSeek scene planner");
    }

    const plan: ScenePlan = JSON.parse(content);

    // Save to database
    await savePlanToDatabase(documentaryId, plan);

    // Update documentary status
    await prisma.documentary.update({
        where: { id: documentaryId },
        data: { status: "SCENES_PLANNED" },
    });

    console.log(
        `[ScenePlanner] ✅ Planned ${plan.scenes.length} scenes, ${plan.assets.length} assets`
    );
}

/**
 * Saves the scene plan to the database, creating all related records
 */
async function savePlanToDatabase(
    documentaryId: string,
    plan: ScenePlan
): Promise<void> {
    // First, create all assets and build a label → id map
    const assetMap = new Map<string, string>();

    for (const asset of plan.assets) {
        const created = await prisma.docAsset.create({
            data: {
                documentaryId,
                type: asset.type,
                label: asset.label,
                description: asset.description,
                attire: asset.attire || null,
            },
        });
        assetMap.set(asset.label, created.id);
    }

    // Then create scenes with shots and shot-asset junctions
    for (let sceneIdx = 0; sceneIdx < plan.scenes.length; sceneIdx++) {
        const scene = plan.scenes[sceneIdx];

        const createdScene = await prisma.docScene.create({
            data: {
                documentaryId,
                sceneIndex: sceneIdx,
                title: scene.title,
                narrationText: scene.narrationText,
                duration: scene.estimatedDuration,
            },
        });

        // Create shots for this scene
        for (let shotIdx = 0; shotIdx < scene.shots.length; shotIdx++) {
            const shot = scene.shots[shotIdx];

            const createdShot = await prisma.docShot.create({
                data: {
                    sceneId: createdScene.id,
                    shotIndex: shotIdx,
                    shotType: shot.shotType || "wide",
                    cameraAngle: shot.cameraAngle || "eye-level",
                    cameraMovement: shot.cameraMovement || "static",
                    action: shot.action || "",
                    mood: shot.mood || "calm",
                    lighting: shot.lighting || "natural",
                    colorPalette: shot.colorPalette || "",
                    transitionIn: shot.transitionIn || "cut",
                    transitionOut: shot.transitionOut || "cut",
                    duration: shot.duration || 5,
                },
            });

            // Link assets to this shot
            for (const assetLabel of shot.assetsUsed || []) {
                const assetId = assetMap.get(assetLabel);
                if (assetId) {
                    await prisma.docShotAsset.create({
                        data: {
                            shotId: createdShot.id,
                            assetId,
                            role: deriveAssetRole(shot, assetLabel, plan.assets),
                        },
                    });
                }
            }
        }
    }
}

/**
 * Infers the role of an asset in a shot based on context
 */
function deriveAssetRole(
    shot: PlannedShot,
    assetLabel: string,
    allAssets: PlannedAsset[]
): string {
    const asset = allAssets.find((a) => a.label === assetLabel);
    if (!asset) return "background";

    if (asset.type === "CHARACTER") {
        if (shot.shotType === "close-up" || shot.shotType === "reaction") {
            return "focus";
        }
        return "foreground";
    }

    if (asset.type === "PROP") {
        if (shot.shotType === "insert") return "focus";
        return "prop-in-hand";
    }

    if (asset.type === "CONCEPT") {
        return "focus";
    }

    if (asset.type === "ENVIRONMENT") {
        if (shot.shotType === "establishing" || shot.shotType === "wide") {
            return "background";
        }
        return "background";
    }

    return "background";
}

async function getApiKey(): Promise<string> {
    const record = await prisma.apiKey.findUnique({
        where: { service: "deepseek" },
    });

    if (!record?.key) {
        throw new Error("DeepSeek API key not found. Add it in Settings.");
    }

    return record.key;
}
