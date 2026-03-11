/**
 * Scene Planner — The AI Filmmaker
 * 
 * Takes a documentary script and breaks it into scenes, each with a
 * simplified shot list optimized for image generation.
 * 
 * Phase 1: Lean shots (action + mood + assets) for Flux.1 image gen
 * Phase 2 (future): Detailed cinematography for Wan2.1 video clips
 */

import { prisma } from "@/lib/prisma";
import type { StoryScript } from "./story-writer";

// Types for the AI response — kept lean for token efficiency
interface PlannedScene {
    title: string;
    narrationText: string;
    duration: number; // seconds
    shots: PlannedShot[];
    searchQueries?: string[]; // AI-generated Pexels search terms
}

interface PlannedShot {
    action: string;          // What happens in this shot
    mood: string;            // Emotional tone
    assetsUsed: string[];    // Asset labels
    duration: number;        // seconds
}

interface PlannedAsset {
    label: string;
    type: "CHARACTER" | "PROP" | "CONCEPT" | "ENVIRONMENT" | "FILLER";
    description: string;     // Visual description for image generation
    attire?: string;         // For CHARACTER type
}

interface ScenePlan {
    scenes: PlannedScene[];
    assets: PlannedAsset[];
}

const SCENE_PLANNER_PROMPT = `You are an expert filmmaker planning a documentary.

Break the script into scenes with a shot list and identify all visual assets needed.

SCRIPT:
{script}

STYLE: {style}

Return JSON in this EXACT compact format:
{
  "assets": [
    {"label": "Dr. Chen", "type": "CHARACTER", "description": "Female physicist, 40s, kind eyes, silver-streaked black hair", "attire": "White lab coat over blue blouse"},
    {"label": "Quantum Field", "type": "CONCEPT", "description": "Swirling energy field of blue and purple light particles"},
    {"label": "Observatory", "type": "ENVIRONMENT", "description": "Modern observatory dome at night with stars visible"}
  ],
  "scenes": [
    {
      "title": "The Awakening",
      "narrationText": "ASSIGNED_POST_PLAN",
      "duration": 60,
      "segmentRange": [0, 3],
      "searchQueries": ["observatory night stars", "telescope astronomer", "starry sky"],
      "shots": [
        {"action": "Wide view of observatory under starry sky", "mood": "wonder", "assetsUsed": ["Observatory"], "duration": 5},
        {"action": "Dr. Chen peers through telescope", "mood": "curiosity", "assetsUsed": ["Dr. Chen", "Observatory"], "duration": 4}
      ]
    }
  ]
}

RULES:
1. Keep 2-4 shots per scene (not more!) for compact output
2. Reuse the same asset labels across scenes for consistency
3. Asset descriptions must be detailed enough for AI image generation
4. Include FILLER assets for transitions (abstract art, particles, starfields)
5. Each shot 3-8 seconds
6. Aim for 8-15 total unique assets
7. Group every 2-3 script segments into one scene
8. For narrationText, just write "ASSIGNED_POST_PLAN" — the verbatim script text will be assigned automatically
9. For segmentRange, specify [startIndex, endIndex] of which script segments belong to this scene (0-indexed)
10. For searchQueries, provide 2-3 SHORT stock video search terms per scene. These are used to find relevant stock footage on Pexels.
    - Each query should be 2-3 words max (noun + optional adjective)
    - Focus on CONCRETE, filmable subjects: "solar flare sun", "forest path night", "trading floor screens", "old telegraph office"
    - Do NOT use abstract concepts: avoid "despair", "fragility", "paradox", "protocol"
    - Think: what would a stock video library actually have footage of?
    - Each query should match a different visual from the scene's narration

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

    // Compile script text for the AI prompt (full script, no truncation)
    const scriptText = script.segments
        .map((seg, i) => `[Segment ${i}] [${seg.timestamp}] ${seg.narration}\n[VISUAL: ${seg.visualCue}]`)
        .join("\n\n");

    const prompt = SCENE_PLANNER_PROMPT
        .replace("{script}", scriptText)
        .replace("{style}", style);

    console.log(`[ScenePlanner] Planning scenes for "${script.title}" (${scriptText.length} chars of script, ${script.segments.length} segments)...`);

    // Retry wrapper for DeepSeek API
    const MAX_RETRIES = 3;
    let response: Response | undefined;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            response = await fetch("https://api.deepseek.com/chat/completions", {
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
                                "You are an expert filmmaker. Create a compact scene plan with shot lists. Return ONLY valid JSON. Do NOT include narration text — just write ASSIGNED_POST_PLAN for narrationText. Focus on scene titles, shots, assets, and segmentRange.",
                        },
                        { role: "user", content: prompt },
                    ],
                    temperature: 0.7,
                    max_tokens: 8192,
                    response_format: { type: "json_object" },
                }),
            });
            break;
        } catch (err: any) {
            console.error(`[ScenePlanner] Fetch attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
            if (attempt === MAX_RETRIES) throw err;
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(r => setTimeout(r, delay));
        }
    }

    if (!response) throw new Error("Failed to get response from DeepSeek after retries");

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`DeepSeek API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
        throw new Error("Empty response from DeepSeek scene planner");
    }

    console.log(`[ScenePlanner] Received ${content.length} chars of JSON`);

    // Parse with truncation repair
    let plan: ScenePlan;
    try {
        plan = JSON.parse(content);
    } catch (parseError) {
        console.warn(`[ScenePlanner] JSON parse failed, attempting truncation repair...`);
        plan = repairTruncatedJSON(content);
    }

    // Validate we have required structure
    if (!plan.assets || !plan.scenes) {
        throw new Error("Scene plan missing required 'assets' or 'scenes' arrays");
    }

    console.log(`[ScenePlanner] Parsed: ${plan.scenes.length} scenes, ${plan.assets.length} assets`);

    // ─── Assign verbatim script text to scenes ──────────────────
    // The AI returns segmentRange hints, but we also handle the fallback
    // where segments are split evenly across scenes.
    assignVerbatimNarration(plan, script);

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
 * Repairs truncated JSON by closing open arrays/objects
 */
function repairTruncatedJSON(content: string): ScenePlan {
    // Remove any control characters
    let cleaned = content.replace(/[\x00-\x1F\x7F]/g, ' ');

    // Try to find the last valid point and close the JSON
    // Count open/close braces and brackets
    let braces = 0;
    let brackets = 0;
    let inString = false;
    let lastValidIdx = 0;

    for (let i = 0; i < cleaned.length; i++) {
        const char = cleaned[i];
        if (char === '"' && (i === 0 || cleaned[i - 1] !== '\\')) {
            inString = !inString;
            continue;
        }
        if (inString) continue;

        if (char === '{') braces++;
        if (char === '}') { braces--; lastValidIdx = i; }
        if (char === '[') brackets++;
        if (char === ']') { brackets--; lastValidIdx = i; }
    }

    // If we have unclosed structures, truncate to last valid close and add closers
    if (braces > 0 || brackets > 0) {
        // Find the last complete array element or object
        let truncated = cleaned.substring(0, lastValidIdx + 1);

        // Remove any trailing comma
        truncated = truncated.replace(/,\s*$/, '');

        // Close any open structures
        for (let i = 0; i < brackets; i++) truncated += ']';
        for (let i = 0; i < braces; i++) truncated += '}';

        console.log(`[ScenePlanner] Repaired truncated JSON: closed ${braces} braces, ${brackets} brackets`);

        try {
            return JSON.parse(truncated);
        } catch (e) {
            // Still failed — try more aggressive truncation
        }
    }

    // Last resort: find the assets array at minimum
    const assetsMatch = cleaned.match(/"assets"\s*:\s*(\[[\s\S]*?\])/);
    if (assetsMatch) {
        console.warn(`[ScenePlanner] Extracting assets-only from truncated response`);
        const assets = JSON.parse(assetsMatch[1]);
        return {
            assets,
            scenes: [{
                title: "Full Documentary",
                narrationText: "",
                duration: 300,
                shots: assets.map((a: PlannedAsset) => ({
                    action: a.description,
                    mood: "wonder",
                    assetsUsed: [a.label],
                    duration: 5,
                })),
            }],
        };
    }

    throw new Error(`Scene planner returned unparseable JSON (${content.length} chars). First 200: ${content.substring(0, 200)}`);
}

/**
 * Assigns verbatim script text from the original segments to each scene.
 * Uses segmentRange hints from the AI if available, otherwise splits evenly.
 */
function assignVerbatimNarration(plan: ScenePlan, script: StoryScript): void {
    const totalSegments = script.segments.length;
    const totalScenes = plan.scenes.length;

    if (totalScenes === 0 || totalSegments === 0) return;

    // Check if AI provided valid segmentRange hints
    const hasSegmentRanges = plan.scenes.every(
        (s: any) => Array.isArray(s.segmentRange) && s.segmentRange.length === 2
    );

    if (hasSegmentRanges) {
        // Use AI's segment assignments
        for (const scene of plan.scenes) {
            const [start, end] = (scene as any).segmentRange as [number, number];
            const clampedStart = Math.max(0, Math.min(start, totalSegments - 1));
            const clampedEnd = Math.max(clampedStart, Math.min(end, totalSegments - 1));

            const assignedSegments = script.segments.slice(clampedStart, clampedEnd + 1);
            scene.narrationText = assignedSegments
                .map(seg => `[${seg.timestamp}] ${seg.narration}\n[VISUAL: ${seg.visualCue}]`)
                .join("\n\n");
            scene.duration = Math.max(scene.duration, assignedSegments.length * 15);
        }

        // Check if any segments were missed (AI error)
        const coveredSet = new Set<number>();
        for (const scene of plan.scenes) {
            const [start, end] = (scene as any).segmentRange as [number, number];
            for (let i = start; i <= end && i < totalSegments; i++) {
                coveredSet.add(i);
            }
        }

        // If segments were missed, append them to the last scene
        if (coveredSet.size < totalSegments) {
            const missed = script.segments.filter((_, i) => !coveredSet.has(i));
            const lastScene = plan.scenes[plan.scenes.length - 1];
            const missedText = missed
                .map(seg => `[${seg.timestamp}] ${seg.narration}\n[VISUAL: ${seg.visualCue}]`)
                .join("\n\n");
            lastScene.narrationText += "\n\n" + missedText;
            console.warn(`[ScenePlanner] ${missed.length} segments not covered by AI ranges, appended to last scene`);
        }
    } else {
        // Fallback: split segments evenly across scenes
        const segmentsPerScene = Math.ceil(totalSegments / totalScenes);

        for (let sceneIdx = 0; sceneIdx < totalScenes; sceneIdx++) {
            const startSeg = sceneIdx * segmentsPerScene;
            const endSeg = Math.min(startSeg + segmentsPerScene, totalSegments);
            const assignedSegments = script.segments.slice(startSeg, endSeg);

            plan.scenes[sceneIdx].narrationText = assignedSegments
                .map(seg => `[${seg.timestamp}] ${seg.narration}\n[VISUAL: ${seg.visualCue}]`)
                .join("\n\n");
            plan.scenes[sceneIdx].duration = Math.max(
                plan.scenes[sceneIdx].duration,
                assignedSegments.length * 15
            );
        }

        console.log(`[ScenePlanner] Assigned ${totalSegments} segments evenly across ${totalScenes} scenes (~${segmentsPerScene} each)`);
    }

    // Log total chars to verify no loss
    const totalChars = plan.scenes.reduce((sum, s) => sum + s.narrationText.length, 0);
    console.log(`[ScenePlanner] Total narration assigned: ${totalChars} chars across ${totalScenes} scenes`);
}

/**
 * Saves the scene plan to the database
 */
async function savePlanToDatabase(
    documentaryId: string,
    plan: ScenePlan
): Promise<void> {
    // Clean up any existing scenes/assets from previous failed runs
    // Order matters due to foreign keys: shot-assets → shots → scenes, then assets + jobs
    const existingScenes = await prisma.docScene.findMany({
        where: { documentaryId },
        include: { shots: { include: { shotAssets: true } } },
    });
    for (const scene of existingScenes) {
        for (const shot of scene.shots) {
            await prisma.docShotAsset.deleteMany({ where: { shotId: shot.id } });
        }
        await prisma.docShot.deleteMany({ where: { sceneId: scene.id } });
    }
    await prisma.docScene.deleteMany({ where: { documentaryId } });
    await prisma.docAsset.deleteMany({ where: { documentaryId } });
    await prisma.genJob.deleteMany({ where: { documentaryId } });
    console.log(`[ScenePlanner] Cleaned up old scenes/assets/jobs for retry`);

    // Valid Prisma AssetType values
    const VALID_TYPES = new Set(["CHARACTER", "PROP", "CONCEPT", "ENVIRONMENT", "FILLER"]);
    const TYPE_MAP: Record<string, string> = {
        // Common alternatives DeepSeek might return
        "VISUAL": "CONCEPT",
        "OBJECT": "PROP",
        "SCENE": "ENVIRONMENT",
        "LOCATION": "ENVIRONMENT",
        "LANDSCAPE": "ENVIRONMENT",
        "PERSON": "CHARACTER",
        "ABSTRACT": "CONCEPT",
        "TRANSITION": "FILLER",
        "EFFECT": "FILLER",
        "BACKGROUND": "ENVIRONMENT",
    };

    // First, create all assets and build a label → id map
    const assetMap = new Map<string, string>();

    for (const asset of plan.assets) {
        // Normalize the type to a valid enum value
        const rawType = (asset.type || "CONCEPT").toUpperCase();
        const normalizedType = VALID_TYPES.has(rawType) ? rawType : (TYPE_MAP[rawType] || "CONCEPT");

        const created = await prisma.docAsset.create({
            data: {
                documentaryId,
                type: normalizedType as any,
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
                duration: scene.duration,
                searchQueries: scene.searchQueries ? JSON.stringify(scene.searchQueries) : null,
            },
        });

        // Create shots for this scene
        for (let shotIdx = 0; shotIdx < (scene.shots || []).length; shotIdx++) {
            const shot = scene.shots[shotIdx];

            const createdShot = await prisma.docShot.create({
                data: {
                    sceneId: createdScene.id,
                    shotIndex: shotIdx,
                    shotType: "wide",
                    cameraAngle: "eye-level",
                    cameraMovement: "static",
                    action: shot.action || "",
                    mood: shot.mood || "calm",
                    lighting: "natural",
                    colorPalette: "",
                    transitionIn: "cut",
                    transitionOut: "cut",
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
                            role: deriveAssetRole(assetLabel, plan.assets),
                        },
                    });
                }
            }
        }
    }
}

/**
 * Infers the role of an asset in a shot
 */
function deriveAssetRole(assetLabel: string, allAssets: PlannedAsset[]): string {
    const asset = allAssets.find((a) => a.label === assetLabel);
    if (!asset) return "background";

    switch (asset.type) {
        case "CHARACTER": return "foreground";
        case "PROP": return "prop-in-hand";
        case "CONCEPT": return "focus";
        case "ENVIRONMENT": return "background";
        case "FILLER": return "background";
        default: return "background";
    }
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
