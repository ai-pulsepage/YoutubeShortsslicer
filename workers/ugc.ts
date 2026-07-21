import { Worker, Job } from "bullmq";
import { prisma } from "../lib/prisma";
import { generateVoiceover } from "../lib/tts";
import { downloadFileFromR2, uploadFileToR2 } from "../lib/storage";
import { getRedisConnection } from "../lib/queue";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import FormData from "form-data";

import { dispatchJob, RedisJob } from "../lib/documentary/redis-client";
import { buildUGCPrompt } from "@/lib/ai/prompt-builder";

// Helper to query API keys from the database (for admin configuration)
async function getDbApiKey(service: string): Promise<string | null> {
    try {
        const dbKey = await prisma.apiKey.findUnique({ where: { service } });
        if (dbKey?.key) {
            return Buffer.from(dbKey.key, "base64").toString("utf8");
        }
    } catch {}
    return null;
}

// ─── Category Action Template Matrix ───────────────────────
function detectActionTemplate(productName: string, description: string): { category: string; actionHook: string; ltxAction: string; brollPattern: string; searchTerms: string[] } {
    const text = `${productName} ${description}`.toLowerCase();

    if (/massager|massage|gun|neck|back|muscle|tissue|relief|sore|kneading|therapy/.test(text)) {
        return {
            category: "Health & Muscle Relief",
            actionHook: "Using a deep-tissue massager on neck and shoulders with a relaxed expression of relief",
            ltxAction: "using a deep-tissue massager on neck and shoulders, relaxed facial expression of physical relief",
            brollPattern: "Close-up massager pulsing on muscles, relaxed relief expression, daily recovery routine",
            searchTerms: ["neck massager massage", "massage gun shoulder", "muscle relief therapy"]
        };
    }
    if (/pressure|washer|car|auto|foam|tire|grill|hose|power tool|drill|wrench/.test(text)) {
        return {
            category: "Automotive & Outdoor Tools",
            actionHook: "Blasting thick grime off a dirty car with a high-pressure washer foam spray",
            ltxAction: "holding a high-pressure washer hose spraying water foam on car, satisfying clean transform",
            brollPattern: "Close-up high pressure water spraying, foam application, satisfying before-and-after clean car transform",
            searchTerms: ["pressure washer car", "car detailing foam", "pressure washing grill"]
        };
    }
    if (/clean|mop|vacuum|steam|stain|soap|scrub|wipe|dust|floor|carpet/.test(text)) {
        return {
            category: "Home & Cleaning",
            actionHook: "Single-swipe steam mop cleaning a muddy floor and instantly wiping away stubborn stains",
            ltxAction: "holding a steam mop cleaning floor, satisfied smile, wiping away stubborn grime",
            brollPattern: "Close-up steam mopping, wiping away stubborn grime, satisfying clean floor transformation",
            searchTerms: ["steam mop floor", "cleaning muddy floor", "vacuum carpet clean"]
        };
    }
    if (/blender|smoothie|mixer|juice|coffee|kitchen|cook|air fryer|pan|pot|recipe|pastry/.test(text)) {
        return {
            category: "Kitchen & Food",
            actionHook: "Drinking a fresh fruit smoothie from a glass with a high-speed blender whirlpool in background",
            ltxAction: "drinking a fresh fruit smoothie from a glass, smiling in delight",
            brollPattern: "Dropping fresh fruit into blender, high-speed blending vortex, pouring into glass and tasting",
            searchTerms: ["drinking smoothie glass", "blender smoothie fruit", "pouring smoothie glass"]
        };
    }
    if (/serum|skin|face|cream|lotion|beauty|makeup|hair|shampoo|supplement|vitamin|dopamine|pill/.test(text)) {
        return {
            category: "Beauty & Health",
            actionHook: "Satisfying morning serum dropper application and healthy daily routine mix",
            ltxAction: "applying skincare serum dropper to cheek, glowing facial expression, morning routine",
            brollPattern: "Close-up product application, morning routine glow, daily habit demo",
            searchTerms: ["skincare serum drop", "morning health routine", "vitamin drink mix"]
        };
    }
    return {
        category: "Gadgets & Everyday Tools",
        actionHook: "Tactile hands-on product unboxing and magnetic snap-on feature demo",
        ltxAction: "holding product doing hands-on demonstration, smiling confidently at camera",
        brollPattern: "Close-up hands-on demonstration, unboxing reveal, daily practical use",
        searchTerms: ["unboxing tech gadget", "hands on product demo", "magnetic snap tech"]
    };
}

// ─── DeepSeek Script Generator ───────────────────────────
async function generateScriptWithDeepSeek(job: any): Promise<string> {
    let apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        apiKey = await getDbApiKey("deepseek_api_key") || "";
    }

    const hookStyle = job.hookStyle;
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

    // Sanitize product name to remove any lingering tracking query strings like Ref=Sspa
    const cleanProductName = (job.product.name || "Featured Product")
        .replace(/\bRef\s*=\s*\w+/gi, "")
        .replace(/\bSspa\s*\w+/gi, "")
        .replace(/\s+/g, " ")
        .trim();

    const avatarName = job.avatar?.name || "Presenter";
    const avatarPersona = job.avatar?.persona || "Friendly enthusiast";
    const actionTemplate = detectActionTemplate(cleanProductName, job.product.description || "");

    const systemPrompt = `You are a world-class viral TikTok / Reels UGC content creator and viral scriptwriter. 

Write a 30-45 second VIRAL short-form video script for a creator named "${avatarName}" (${avatarPersona || "authentic reviewer"}).

PRODUCT TO SELL:
- Name: "${cleanProductName}"
- Category: "${actionTemplate.category}"
- Visual Action Pattern: "${actionTemplate.actionHook}"
- Features: "${job.product.description || cleanProductName}"
- Price: ${job.product.price || "great deal"}

STRICT VIRAL ACTION SCRIPTING RULES:
1. VISUAL ACTION HOOK: Incorporate the satisfying real-world action: "${actionTemplate.actionHook}". The presenter talks while performing or demonstrating this action (e.g., pressure washing, blending a smoothie, mopping a floor, or applying a serum).
2. PRODUCT IS THE HERO: The script MUST be 100% focused on using and demonstrating "${cleanProductName}". Show the satisfying result of using this product.
3. CONVERSATIONAL TIKTOK SPOKEN VOICE: Authentic, energetic, relatable spoken English. No stiff corporate sales pitches.
4. NO URL OR TRACKING JARGON: Never mention URL parameter codes or tracking tags.
5. OUTPUT FORMAT: Output ONLY the exact words spoken by ${avatarName}. No scene directions, sound effects, timestamps, or character labels.`;

    if (!apiKey) {
        console.warn("[UGC Worker] DeepSeek API Key not configured. Using fallback script.");
        return `Hey guys! Have you checked out the all-new ${job.product.name}? It is absolutely amazing! For just ${job.product.price || "a great price"}, it is definitely worth trying. Click the link in my bio to get yours today!`;
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
                    { role: "user", content: `Write an authentic UGC script about "${job.product.name}". Focus on its benefits and why the viewer needs it now. Hook style: ${job.hookStyle}.` }
                ],
                temperature: 0.8,
                max_tokens: 500,
            })
        });

        if (!res.ok) throw new Error(`DeepSeek API error: ${res.statusText}`);
        const data = await res.json();
        return data.choices?.[0]?.message?.content?.trim() || "";
    } catch (err: any) {
        console.error("[UGC Worker] Script generation failed, falling back:", err.message);
        return `Hey guys! Have you checked out the all-new ${job.product.name}? It is absolutely amazing! For just ${job.product.price || "a great price"}, it is definitely worth trying. Click the link in my bio to get yours today!`;
    }
}

// ─── Hedra Talking Head API ──────────────────────────────
async function generateHedraTalkingHead(
    imagePath: string,
    audioPath: string,
    apiKey: string,
    tempDir: string
): Promise<string> {
    const baseUrl = "https://api.hedra.com/web-app/public";

    // Step 1: Create image asset
    console.log("[Hedra] Registering image asset...");
    const imgRegisterRes = await fetch(`${baseUrl}/assets`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey
        },
        body: JSON.stringify({ name: "avatar.png", type: "image" })
    });
    if (!imgRegisterRes.ok) throw new Error(`Failed to register image asset: ${await imgRegisterRes.text()}`);
    const imgAsset = await imgRegisterRes.json();
    const imageAssetId = imgAsset.id;

    // Step 2: Upload image file
    console.log("[Hedra] Uploading image file...");
    const imgForm = new FormData();
    imgForm.append("file", fs.createReadStream(imagePath));
    const imgUploadRes = await fetch(`${baseUrl}/assets/${imageAssetId}/upload`, {
        method: "POST",
        headers: {
            "X-API-Key": apiKey,
            ...imgForm.getHeaders()
        },
        body: imgForm as any
    });
    if (!imgUploadRes.ok) throw new Error(`Failed to upload image file: ${await imgUploadRes.text()}`);

    // Step 3: Create audio asset
    console.log("[Hedra] Registering audio asset...");
    const audioRegisterRes = await fetch(`${baseUrl}/assets`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey
        },
        body: JSON.stringify({ name: "tts.mp3", type: "audio" })
    });
    if (!audioRegisterRes.ok) throw new Error(`Failed to register audio asset: ${await audioRegisterRes.text()}`);
    const audioAsset = await audioRegisterRes.json();
    const audioAssetId = audioAsset.id;

    // Step 4: Upload audio file
    console.log("[Hedra] Uploading audio file...");
    const audioForm = new FormData();
    audioForm.append("file", fs.createReadStream(audioPath));
    const audioUploadRes = await fetch(`${baseUrl}/assets/${audioAssetId}/upload`, {
        method: "POST",
        headers: {
            "X-API-Key": apiKey,
            ...audioForm.getHeaders()
        },
        body: audioForm as any
    });
    if (!audioUploadRes.ok) throw new Error(`Failed to upload audio file: ${await audioUploadRes.text()}`);

    // Step 5: Submit generation request
    console.log("[Hedra] Launching generation job...");
    const genRes = await fetch(`${baseUrl}/generations`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey
        },
        body: JSON.stringify({
            type: "video",
            reference_image_ids: [imageAssetId],
            audio_id: audioAssetId
        })
    });
    if (!genRes.ok) throw new Error(`Failed to start generation: ${await genRes.text()}`);
    const genData = await genRes.json();
    const generationId = genData.id;

    // Step 6: Poll status until complete
    console.log(`[Hedra] Polling job ${generationId}...`);
    const startTime = Date.now();
    const timeout = 10 * 60 * 1000; // 10 minutes timeout

    while (Date.now() - startTime < timeout) {
        const statusRes = await fetch(`${baseUrl}/generations/${generationId}/status`, {
            headers: { "X-API-Key": apiKey }
        });
        if (!statusRes.ok) throw new Error(`Failed to fetch status: ${await statusRes.text()}`);
        const statusData = await statusRes.json();

        console.log(`[Hedra] Status: ${statusData.status}`);
        if (statusData.status === "complete") {
            if (!statusData.url) throw new Error("Generation complete but no video URL returned");
            return statusData.url;
        }
        if (statusData.status === "error") {
            throw new Error(`Hedra generation failed: ${statusData.error_message || "Unknown error"}`);
        }

        // Wait 5 seconds between checks
        await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    throw new Error("Hedra talking head generation timed out");
}

// ─── Together.ai Wan 2.7 B-Roll Video ─────────────────────
async function generateWanVideoBRoll(job: any): Promise<string> {
    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) throw new Error("TOGETHER_API_KEY not configured");

    const prompt = `Close up realistic advertising B-roll clip of ${job.product.name}. ${job.product.description || ""}. Commercial presentation, high resolution, clean studio lighting.`;
    
    console.log("[Wan B-Roll] Requesting Together.ai video generation...");
    const res = await fetch("https://api.together.xyz/v1/videos/create", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            prompt,
            model: "Wan-AI/wan2.7-t2v",
            width: 1080,
            height: 960
        })
    });

    if (!res.ok) throw new Error(`Wan B-Roll creation failed: ${await res.text()}`);
    const jobData = await res.json();
    const jobId = jobData.id;

    console.log(`[Wan B-Roll] Polling Together.ai job ${jobId}...`);
    const startTime = Date.now();
    const timeout = 8 * 60 * 1000; // 8 minutes

    while (Date.now() - startTime < timeout) {
        const checkRes = await fetch(`https://api.together.xyz/v1/videos/${jobId}`, {
            headers: { "Authorization": `Bearer ${apiKey}` }
        });
        if (!checkRes.ok) throw new Error(`Failed to poll Wan B-Roll status: ${await checkRes.text()}`);
        const checkData = await checkRes.json();

        console.log(`[Wan B-Roll] Status: ${checkData.status}`);
        if (checkData.status === "completed") {
            return checkData.outputs.video_url;
        }
        if (checkData.status === "failed") {
            throw new Error("Together.ai Wan generation failed");
        }

        await new Promise((resolve) => setTimeout(resolve, 10000));
    }

    throw new Error("Wan B-roll generation timed out");
}

// ─── Main UGC Worker ─────────────────────────────────────
export const ugcWorker = new Worker(
    "ugc-generation",
    async (job: Job) => {
        const { jobId } = job.data;
        console.log(`[UGC Worker] Starting job: ${jobId}`);

        // Update status to script generation
        await prisma.uGCJob.update({
            where: { id: jobId },
            data: { status: "GENERATING_SCRIPT" },
        });

        // 1. Fetch UGCJob metadata
        const ugcJob = await prisma.uGCJob.findUnique({
            where: { id: jobId },
            include: { avatar: true, product: true },
        });

        if (!ugcJob) throw new Error(`UGCJob not found: ${jobId}`);

        try {
            // 2. Generate script using LLM if not custom-written
            let script = ugcJob.script;
            if (!script) {
                console.log("[UGC Worker] Script is empty. Triggering AI script generation...");
                script = await generateScriptWithDeepSeek(ugcJob);
                await prisma.uGCJob.update({
                    where: { id: jobId },
                    data: { script },
                });
            }

            await prisma.uGCJob.update({
                where: { id: jobId },
                data: { status: "GENERATING_VIDEO" },
            });

            // Set up a temporary local workspace
            const tempDir = path.join(os.tmpdir(), `ugc-${jobId}`);
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

            // Read selected model/voice settings from job metadata
            const metadataObj = ugcJob.metadata ? (ugcJob.metadata as any) : {};
            const selectedVoiceEngine = metadataObj.voiceEngine || ugcJob.avatar.voiceEngine || "elevenlabs";
            const selectedVideoModel = metadataObj.videoModel || "ltx";

            // 3. Generate TTS audio from script using local tts utility
            console.log(`[UGC Worker] Running TTS audio generation using engine: ${selectedVoiceEngine}...`);
            const audioBuffer = await generateVoiceover({
                text: script,
                engine: (selectedVoiceEngine as any),
                voiceId: ugcJob.avatar.voiceId || "21m00Tcm4TlvDq8ikWAM",
                speakerWav: ugcJob.avatar.voiceRefPath || undefined,
            });

            const audioPath = path.join(tempDir, "tts.mp3");
            fs.writeFileSync(audioPath, audioBuffer);

            // Get audio duration using ffprobe
            const audioDurationStr = execSync(
                `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
            ).toString().trim();
            const duration = parseFloat(audioDurationStr) || 15.0;

            // 4. Retrieve character's reference image
            let avatarImagePath = "";
            if (ugcJob.avatar.referenceImageUrl) {
                avatarImagePath = path.join(tempDir, "avatar.png");
                console.log("[UGC Worker] Downloading reference image from S3/R2...");
                await downloadFileFromR2(ugcJob.avatar.referenceImageUrl, avatarImagePath);
            } else {
                avatarImagePath = path.join(tempDir, "avatar.png");
                console.log("[UGC Worker] No avatar image provided. Generating placeholder...");
                // Create a basic gray placeholder image
                execSync(`ffmpeg -f lavfi -i color=c=gray:s=1080x1080:d=1 -vframes 1 "${avatarImagePath}" -y`);
            }

            // 5. Generate Native Video Ad Clip from RunPod GPU Worker
            let talkingHeadLocalPath = path.join(tempDir, "talking_head.mp4");
            const avatarName = ugcJob.avatar.name || "Spokesperson";
            const persona = ugcJob.avatar.persona || "friendly UGC creator";
            const actionTpl = detectActionTemplate(ugcJob.product?.name || "", ugcJob.product?.description || "");
            
            // Clean Kinematic Prose Prompt (NO raw narration text pollution)
            const ltxPrompt = buildUGCPrompt(avatarName, persona, actionTpl.ltxAction, ugcJob.product?.name);
            const runpodJobId = `ugc-${selectedVideoModel}-${jobId}-${Date.now()}`;
            const ltxOutputR2Key = `ugc/jobs/${jobId}/ltx_avatar.mp4`;

            console.log(`[UGC Worker] 🚀 Dispatching clean video job to RunPod GPU Queue: ${runpodJobId} (${selectedVideoModel})`);
            console.log(`[UGC Worker] Kinematic Prompt: "${ltxPrompt}"`);
            const redisJob: RedisJob = {
                jobId: runpodJobId,
                documentaryId: jobId,
                type: "shot_video",
                prompt: ltxPrompt,
                referenceImages: ugcJob.avatar.referenceImageUrl ? [ugcJob.avatar.referenceImageUrl] : [],
                metadata: {
                    model: selectedVideoModel,
                    duration: Math.min(Math.ceil(duration), 15),
                    width: 768,
                    height: 1280,
                    r2Key: ltxOutputR2Key,
                    sourceApp: "UGC Studio",
                    title: avatarName
                }
            };

            await dispatchJob(redisJob);

            // Wait for generated video from R2 (up to 15 minute timeout for GPU rendering)
            const startTime = Date.now();
            let ltxSuccess = false;
            while (Date.now() - startTime < 900000) {
                try {
                    const ltxTempFile = path.join(tempDir, "ltx_download.mp4");
                    await downloadFileFromR2(ltxOutputR2Key, ltxTempFile);
                    if (fs.existsSync(ltxTempFile) && fs.statSync(ltxTempFile).size > 1000) {
                        console.log("[UGC Worker] ✅ Downloaded generated native video ad clip from RunPod GPU!");
                        fs.copyFileSync(ltxTempFile, talkingHeadLocalPath);
                        ltxSuccess = true;
                        break;
                    }
                } catch {
                    // Wait 5s before polling again
                    await new Promise(r => setTimeout(r, 5000));
                }
            }
            if (!ltxSuccess) {
                throw new Error("RunPod GPU video generation timed out after 15 minutes");
            }

            // Set state to compositing
            await prisma.uGCJob.update({
                where: { id: jobId },
                data: { status: "COMPOSITING" },
            });

            // 6. Native Video Ad Output Assembly (Mux ElevenLabs Audio Track + Video Clip)
            const finalVideoPath = path.join(tempDir, "final.mp4");
            
            console.log("[UGC Worker] Muxing ElevenLabs speech audio track into 9:16 vertical video...");
            if (fs.existsSync(audioPath) && fs.statSync(audioPath).size > 100) {
                execSync(
                    `ffmpeg -i "${talkingHeadLocalPath}" -i "${audioPath}" -filter_complex ` +
                    `"[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black[v]" ` +
                    `-map "[v]" -map 1:a -c:v libx264 -preset fast -crf 23 -c:a aac -shortest "${finalVideoPath}" -y`
                );
            } else {
                execSync(
                    `ffmpeg -i "${talkingHeadLocalPath}" -vf ` +
                    `"scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black" ` +
                    `-c:v libx264 -preset fast -crf 23 -an "${finalVideoPath}" -y`
                );
            }

            // 7. Upload results to R2 storage with descriptive filenames
            const campaignId = ugcJob.campaignId;
            const productId = ugcJob.productId;
            const cleanAvatar = avatarName.replace(/[^a-zA-Z0-9]/g, "_");
            const cleanProduct = (ugcJob.product?.name || "Product").replace(/[^a-zA-Z0-9]/g, "_");
            const descriptiveFileName = `${cleanAvatar}_${cleanProduct}_Ad_${jobId.slice(0, 6)}.mp4`;
            const descriptiveThumbName = `${cleanAvatar}_${cleanProduct}_Ad_${jobId.slice(0, 6)}.jpg`;

            let finalR2Key = `ugc/products/${productId}/ads/${jobId}/${descriptiveFileName}`;
            let thumbR2Key = `ugc/products/${productId}/ads/${jobId}/${descriptiveThumbName}`;

            if (campaignId) {
                finalR2Key = `ugc/campaigns/${campaignId}/products/${productId}/ads/${jobId}/${descriptiveFileName}`;
                thumbR2Key = `ugc/campaigns/${campaignId}/products/${productId}/ads/${jobId}/${descriptiveThumbName}`;
            }

            console.log(`[UGC Worker] Uploading final video to R2 key: ${finalR2Key}`);
            await uploadFileToR2(finalVideoPath, finalR2Key, "video/mp4");

            // Extract a thumbnail frame
            const thumbnailPath = path.join(tempDir, "thumb.jpg");
            execSync(`ffmpeg -i "${finalVideoPath}" -ss 00:00:00.5 -vframes 1 "${thumbnailPath}" -y`);
            await uploadFileToR2(thumbnailPath, thumbR2Key, "image/jpeg");

            // Update status in DB to DONE
            await prisma.uGCJob.update({
                where: { id: jobId },
                data: {
                    status: "DONE",
                    outputUrl: finalR2Key,
                    thumbnailUrl: thumbR2Key,
                    duration,
                },
            });

            console.log(`[UGC Worker] Job complete: ${jobId}`);
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (err: any) {
            console.error(`[UGC Worker] Job failed: ${jobId}`, err.message);
            await prisma.uGCJob.update({
                where: { id: jobId },
                data: {
                    status: "FAILED",
                    errorMsg: err.message || "Unknown rendering error",
                },
            });
            throw err;
        }
    },
    {
        connection: getRedisConnection() as any
    }
);
