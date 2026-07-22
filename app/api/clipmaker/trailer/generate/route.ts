import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildKinematicPrompt } from "@/lib/ai/prompt-builder";
import { dispatchJob } from "@/lib/documentary/redis-client";

// Helper to query API keys from DB
async function getDbApiKey(service: string): Promise<string | null> {
    try {
        const dbKey = await prisma.apiKey.findUnique({ where: { service } });
        if (dbKey?.key) {
            return Buffer.from(dbKey.key, "base64").toString("utf8");
        }
    } catch {}
    return null;
}

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { title, concept, genre, videoModel, voiceEngine } = await req.json();

    if (!title || !concept) {
        return NextResponse.json({ error: "Title and concept are required" }, { status: 400 });
    }

    let apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        apiKey = (await getDbApiKey("deepseek_api_key")) || "";
    }

    const selectedVideoModel = videoModel || "wan2.3";
    const selectedVoiceEngine = voiceEngine || "cosyvoice2";
    const trailerType = genre || "Game Trailer";

    const systemPrompt = `You are an elite Hollywood and AAA video game trailer director. Write a high-octane 5-shot trailer storyboard for the following ${trailerType}:
Title: ${title}
Concept: ${concept}

Generate EXACTLY 5 shots:
1. HOOK: World reveal & atmospheric setup.
2. HERO: Protagonist / main character introduction.
3. ACTION: Fast-paced gameplay / explosive action scene.
4. CLIMAX: Epic boss fight or intense storyline clash.
5. TITLE_DROP: Logo reveal with dramatic narrator call-to-action.

CRITICAL RULES:
- Provide "narration": Spoken narrator dialogue in epic trailer voice.
- Provide "visualSubject": Physical subject description.
- Provide "visualAction": Visual movement and mechanics.
- Provide "environment": Lighting, atmosphere, and background setting.

Return ONLY a valid JSON array of 5 shot objects matching:
[
  {
    "shotIndex": 1,
    "shotType": "wide shot",
    "narration": "In a world consumed by shadow...",
    "visualSubject": "Futuristic skyline of Neo-Tokyo",
    "visualAction": "camera sweeps down glowing neon skyscrapers",
    "environment": "dark rainy night, holographic neon reflections",
    "cameraMovement": "fast crane down movement"
  }
]`;

    let shots: any[] = [];
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
                        { role: "user", content: `Generate trailer for: ${title}` },
                    ],
                    temperature: 0.8,
                    max_tokens: 1200,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                let text = data.choices?.[0]?.message?.content?.trim() || "";
                if (text.startsWith("```")) {
                    text = text.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
                }
                shots = JSON.parse(text);
            }
        } catch (err: any) {
            console.warn("[Trailer Generator] LLM script generation failed, using template fallback:", err.message);
        }
    }

    // Fallback if AI generation failed or key missing
    if (!shots || shots.length === 0) {
        shots = [
            {
                shotIndex: 1,
                shotType: "wide shot",
                narration: `Prepare yourself for ${title}...`,
                visualSubject: `The vast world of ${title}`,
                visualAction: "slow majestic push forward",
                environment: "dramatic cinematic environment with intense lighting",
                cameraMovement: "slow forward push-in"
            },
            {
                shotIndex: 2,
                shotType: "close-up",
                narration: "A hero emerges from the ashes.",
                visualSubject: "The main protagonist",
                visualAction: "turning toward camera with fierce determination",
                environment: "smoke filled battlefield, ember particles floating",
                cameraMovement: "handheld tracking shot"
            },
            {
                shotIndex: 3,
                shotType: "medium action shot",
                narration: "Unleash power beyond imagination.",
                visualSubject: "Hero unleashing a glowing energy strike",
                visualAction: "executing a high-speed combat maneuver",
                environment: "crumbling ancient ruins, vibrant particle sparks",
                cameraMovement: "whip pan right"
            },
            {
                shotIndex: 4,
                shotType: "low-angle shot",
                narration: "Face the ultimate enemy.",
                visualSubject: "A towering boss monster with glowing eyes",
                visualAction: "roaring aggressively as ground shakes",
                environment: "dark volcanic lair, molten lava key light",
                cameraMovement: "tilt up from ground"
            },
            {
                shotIndex: 5,
                shotType: "center framed logo shot",
                narration: `${title}. Wishlist now on Steam.`,
                visualSubject: `3D Metallic title logo of ${title}`,
                visualAction: "gleaming brightly against dark background",
                environment: "deep black void with golden embers",
                cameraMovement: "static hero frame"
            }
        ];
    }

    // Build Kinematic Prompts for each shot using buildKinematicPrompt
    const processedShots = shots.map((s, idx) => {
        const kinematicPrompt = buildKinematicPrompt({
            aspectRatio: "16:9",
            shotType: s.shotType || "medium shot",
            subject: s.visualSubject,
            action: s.visualAction,
            environment: s.environment,
            cameraMovement: s.cameraMovement || "gentle push-in",
            stylePreset: `${trailerType}, 4k ultra-detailed, cinematic movie trailer`
        });

        return {
            shotIndex: idx + 1,
            narration: s.narration,
            kinematicPrompt,
            videoModel: selectedVideoModel,
            voiceEngine: selectedVoiceEngine
        };
    });

    // Create a new Documentary/Trailer project record
    const project = await prisma.documentary.create({
        data: {
            userId: session.user.id,
            title: `${title} (${trailerType})`,
            genre: "trailer",
            subStyle: trailerType.toLowerCase().replace(/[^a-z0-9]/g, "_"),
            status: "GENERATING",
            script: JSON.stringify({ title, concept, shots: processedShots }),
            scenes: {
                create: processedShots.map((ps) => ({
                    sceneIndex: ps.shotIndex,
                    title: `Shot ${ps.shotIndex}`,
                    narrationText: ps.narration,
                    searchQueries: JSON.stringify([ps.kinematicPrompt])
                }))
            }
        }
    });

    // Create GenJob records and dispatch onto Redis Queue for each shot
    const dispatchedJobs = [];
    for (const ps of processedShots) {
        const r2Key = `trailers/projects/${project.id}/shots/shot_${ps.shotIndex}.mp4`;
        const jobMetadata = {
            docId: project.id,
            shotIndex: ps.shotIndex,
            sourceApp: "ClipMaker Trailer Studio",
            model: selectedVideoModel,
            hasNativeAudio: selectedVideoModel === "ltx2.3",
            r2Key
        };

        const genJob = await prisma.genJob.create({
            data: {
                documentaryId: project.id,
                jobType: "shot_video",
                prompt: ps.kinematicPrompt,
                status: "QUEUED",
                metadata: jobMetadata as any
            }
        });

        await dispatchJob({
            jobId: genJob.id,
            documentaryId: project.id,
            type: "shot_video",
            prompt: ps.kinematicPrompt,
            referenceImages: [],
            metadata: jobMetadata
        });

        dispatchedJobs.push(genJob.id);
    }

    return NextResponse.json({
        success: true,
        projectId: project.id,
        title: project.title,
        dispatchedJobsCount: dispatchedJobs.length,
        shots: processedShots
    });
}
