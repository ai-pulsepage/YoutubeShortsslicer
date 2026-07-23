import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

    try {
        const { suggestion, voiceEngine } = await req.json();
        if (!suggestion || !suggestion.trim()) {
            return NextResponse.json({ error: "Suggestion prompt is required" }, { status: 400 });
        }

        let apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            apiKey = await getDbApiKey("deepseek_api_key") || "";
        }

        // 1. Generate profile layout using DeepSeek
        let name = `${suggestion.trim()} Presenter`;
        let promptText = `Highly realistic, professional headshot photo of a real human spokesperson representing ${suggestion.trim()}, warm friendly smile, natural skin texture, sharp details, plain solid color studio background, shot on 85mm lens, f/1.8, cinematic lighting, photorealistic, 8k resolution`;
        let persona = `A realistic professional spokesperson speaking about ${suggestion.trim()}`;
        let gender = "female";

        if (apiKey) {
            try {
                const systemPrompt = `You are a creative character designer. Generate a JSON object describing a realistic, professional real human presenter (UGC spokesperson) based on the user's suggestion. The presenter should look like a real person, not an animation or cartoon.
Return ONLY a valid JSON object matching this schema:
{
  "name": "Sarah - Skincare Expert",
  "prompt": "Photorealistic medium-shot photo from waist up of a real woman skincare expert with visible hands, warm friendly smile, clear skin, simple elegant attire, soft solid studio background, natural skin texture, 35mm lens...",
  "persona": "An expert skincare aesthetician who speaks softly and offers practical advice.",
  "gender": "female"
}
Ensure the prompt describes a waist-up medium shot with visible hands, outfit, backdrop, and photorealistic human appearance. Avoid any reference to headshot, Pixar, 3D, animation, digital art, cartoon, drawing, illustration. Make it under 40 words.`;

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
                            { role: "user", content: `Suggestion: ${suggestion}` }
                        ],
                        response_format: { type: "json_object" },
                        temperature: 0.8
                    })
                });

                if (res.ok) {
                    const resData = await res.json();
                    const text = resData.choices?.[0]?.message?.content?.trim();
                    if (text) {
                        const parsed = JSON.parse(text);
                        if (parsed.name) name = parsed.name;
                        if (parsed.prompt) promptText = parsed.prompt;
                        if (parsed.persona) persona = parsed.persona;
                        if (parsed.gender) gender = parsed.gender.toLowerCase();
                    }
                }
            } catch (err: any) {
                console.warn("[Avatar Generate API] DeepSeek prompt design failed, using fallback templates:", err.message);
            }
        }

        // 2. Select appropriate voice ID based on engine and gender
        const engine = voiceEngine || "elevenlabs";
        let voiceId = "";
        if (engine === "elevenlabs") {
            voiceId = gender === "male" ? "pNInz6obpgq5mWGP36TZ" : "EXAVITQu4vr4xnSDxMaL";
        } else if (engine === "dia") {
            voiceId = gender === "male" ? "male_default" : "female_default";
        } else {
            voiceId = gender === "male" ? "adam" : "lisa";
        }

        // 3. Locate or create a private UGC system documentary vault for database tracking
        let ugcVault = await prisma.documentary.findFirst({
            where: { userId: session.user.id, genre: "ugc_vault" }
        });
        if (!ugcVault) {
            ugcVault = await prisma.documentary.create({
                data: {
                    userId: session.user.id,
                    title: "UGC Vault",
                    genre: "ugc_vault",
                    status: "DRAFT"
                }
            });
        }

        // 4. Create the UGCAvatar database record
        const avatar = await prisma.uGCAvatar.create({
            data: {
                userId: session.user.id,
                name,
                persona,
                voiceEngine: engine,
                voiceId
            }
        });

        // 5. Create a GenJob to track image generation
        const job = await prisma.genJob.create({
            data: {
                documentaryId: ugcVault.id,
                jobType: "ref_image",
                prompt: promptText,
                status: "QUEUED",
                metadata: { 
                    ugcAvatarId: avatar.id,
                    sourceApp: "AI UGC Studio",
                    title: `Avatar: ${name}`
                } as any
            }
        });

        // 6. Queue job on Redis/RunPod queue
        await dispatchJob({
            jobId: job.id,
            documentaryId: ugcVault.id,
            type: "ref_image",
            prompt: promptText,
            referenceImages: [],
            metadata: { 
                ugcAvatarId: avatar.id, 
                model: "flux",
                sourceApp: "AI UGC Studio",
                title: `Avatar: ${name}`
            }
        });

        return NextResponse.json({
            success: true,
            avatar: {
                ...avatar,
                jobId: job.id,
                jobStatus: "QUEUED"
            }
        });

    } catch (err: any) {
        console.error("[Avatar Generate POST] failed:", err.message);
        return NextResponse.json({ error: "Failed to generate avatar", details: err.message }, { status: 500 });
    }
}
