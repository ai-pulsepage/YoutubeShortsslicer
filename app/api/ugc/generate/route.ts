import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getQueue } from "@/lib/queue";

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

// Inline script generator using DeepSeek
async function generateScriptWithDeepSeek(avatar: any, product: any, hookStyle: string): Promise<string> {
    let apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        apiKey = await getDbApiKey("deepseek_api_key") || "";
    }

    let styleInstruction = "";
    if (hookStyle === "CONTRARIAN") {
        styleInstruction = "Open with a shocking, contrarian hook (e.g., 'Stop buying expensive alternative X, here is a secret hack...'), position this product as the smart alternative, and focus on practical value.";
    } else if (hookStyle === "INFORMERCIAL" || hookStyle === "SALES_PITCH") {
        styleInstruction = "Write in an energetic sales pitch style. Highlight the core features, the pricing value, special offers, and conclude with a strong Call-To-Action.";
    } else if (hookStyle === "TESTIMONIAL") {
        styleInstruction = "Write from a customer's personal perspective. Describe a pain point they struggled with, introduce the product as the savior, and contrast the before-and-after experience.";
    } else if (hookStyle === "DRAMA") {
        styleInstruction = "Open with a narrative hook that sounds like a personal story (e.g., 'You will not believe what happened when...'). Tell an engaging, relatable story centering around the product.";
    } else {
        styleInstruction = `Focus on hook style: ${hookStyle}. Keep it highly engaging and natural.`;
    }

    const systemPrompt = `You are a viral short-form content creator. Write a short, highly engaging 30-45 second video script for the following product:
Name: ${product.name}
Description: ${product.description || "N/A"}
Price: ${product.price || "N/A"}
Avatar persona: ${avatar.persona || "A generic presenter"}

Style Guidelines:
${styleInstruction}

The script must be optimized for a TikTok UGC video. Output ONLY the words spoken by the presenter. Do NOT include scene directions, sound effects, timestamps, or speaker labels.`;

    if (!apiKey) {
        console.warn("[UGC Generate Route] DeepSeek API Key not configured. Using fallback script.");
        return `Hey guys! Have you checked out the all-new ${product.name}? It is absolutely amazing! For just ${product.price || "a great price"}, it is definitely worth trying. Click the link in my bio to get yours today!`;
    }

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
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Product: ${product.name}. Describe it using style: ${hookStyle}.` }
                ],
                temperature: 0.8,
                max_tokens: 500,
            })
        });

        if (!res.ok) throw new Error(`DeepSeek API error: ${res.statusText}`);
        const data = await res.json();
        return data.choices?.[0]?.message?.content?.trim() || "";
    } catch (err: any) {
        console.error("[UGC Generate Route] Script generation failed, falling back:", err.message);
        return `Hey guys! Have you checked out the all-new ${product.name}? It is absolutely amazing! For just ${product.price || "a great price"}, it is definitely worth trying. Click the link in my bio to get yours today!`;
    }
}

export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { avatarId, productId, campaignId, hookStyle, customScript, layoutType, videoModel, voiceEngine, adFormat, productAction } = body;

    if (!avatarId || !productId) {
        return NextResponse.json({ error: "Missing avatarId or productId" }, { status: 400 });
    }

    // Verify avatar ownership
    const avatar = await prisma.uGCAvatar.findFirst({
        where: { id: avatarId, userId: session.user.id }
    });
    if (!avatar) return NextResponse.json({ error: "Avatar not found" }, { status: 404 });

    // Verify product ownership
    const product = await prisma.uGCProduct.findFirst({
        where: { id: productId, userId: session.user.id }
    });
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    // Verify campaign ownership if campaignId is provided
    if (campaignId) {
        const campaign = await prisma.uGCCampaign.findFirst({
            where: { id: campaignId, userId: session.user.id }
        });
        if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Generate script if not provided
    let script = customScript || "";
    if (!script) {
        script = await generateScriptWithDeepSeek(avatar, product, hookStyle || "TESTIMONIAL");
    }

    // Create UGCJob in PENDING state
    const job = await prisma.uGCJob.create({
        data: {
            userId: session.user.id,
            avatarId,
            productId,
            campaignId: campaignId || null,
            hookStyle: hookStyle || "TESTIMONIAL",
            script,
            status: "PENDING",
            metadata: {
                layoutType: layoutType || "SPLIT",
                videoModel: videoModel || "ltx",
                voiceEngine: voiceEngine || "elevenlabs",
                adFormat: adFormat || "problem_solution",
                productAction: productAction || "holding_to_camera"
            }
        }
    });

    // Queue job in BullMQ
    try {
        const ugcQueue = getQueue("ugc-generation");
        await ugcQueue.add("ugc-job", { jobId: job.id });
    } catch (err: any) {
        console.error("[UGC Generate Route] Failed to queue BullMQ job:", err.message);
        // We still return success as the DB record is created and will be processed
    }

    return NextResponse.json({ jobId: job.id, status: job.status });
}
