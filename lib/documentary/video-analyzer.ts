import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { prisma } from "@/lib/prisma";

const s3 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT || "",
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    },
});

const BUCKET = process.env.R2_BUCKET_NAME || "youtubeshorts";

export interface VisualAnalysisResult {
    headcount: number;
    detectedCharacters: Array<{
        name: string;
        prompt: string;
    }>;
    sceneBeats: Array<{
        sceneIndex: number;
        description: string;
    }>;
}

/**
 * Extract keyframe base64 images from an R2 video file using FFmpeg seeking
 */
export async function extractVideoKeyframes(
    r2Key: string,
    durationSeconds: number,
    numFrames = 6
): Promise<string[]> {
    const tempDir = path.join(os.tmpdir(), `analyzer-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
        // 1. Generate signed URL for R2 object
        const signedUrl = await getSignedUrl(
            s3,
            new GetObjectCommand({ Bucket: BUCKET, Key: r2Key }),
            { expiresIn: 1800 }
        );

        const base64Frames: string[] = [];
        const duration = durationSeconds > 0 ? durationSeconds : 30;
        
        // Distribute frames evenly, skipping start/end buffers
        for (let i = 0; i < numFrames; i++) {
            const timePoint = Math.round(duration * (0.1 + (i / numFrames) * 0.8));
            const outPath = path.join(tempDir, `frame-${i}.png`);

            try {
                // ffmpeg seeking over HTTPS URL directly
                execSync(
                    `ffmpeg -ss ${timePoint} -i "${signedUrl}" -frames:v 1 -q:v 2 "${outPath}" -y`,
                    { timeout: 45000, stdio: "ignore" }
                );

                if (fs.existsSync(outPath)) {
                    const imgBuffer = fs.readFileSync(outPath);
                    base64Frames.push(imgBuffer.toString("base64"));
                }
            } catch (ffmpegErr: any) {
                console.warn(`[Video Analyzer] FFmpeg frame extraction failed at ${timePoint}s:`, ffmpegErr.message);
            }
        }

        return base64Frames;
    } finally {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) {}
    }
}

/**
 * Perform Multimodal Video Analysis using Gemini 2.5 Flash
 */
export async function analyzeVideoVisually(
    videoId: string
): Promise<VisualAnalysisResult | null> {
    try {
        // 1. Lookup video from DB
        const video = await prisma.video.findUnique({
            where: { id: videoId }
        });

        if (!video || !video.storagePath) {
            console.warn(`[Video Analyzer] Video ${videoId} or storagePath not found`);
            return null;
        }

        const duration = video.duration || 30;
        console.log(`[Video Analyzer] Extracting frames from ${video.storagePath} (${duration}s)...`);

        // 2. Extract base64 frames
        const base64Frames = await extractVideoKeyframes(video.storagePath, duration, 6);
        if (base64Frames.length === 0) {
            console.warn(`[Video Analyzer] No keyframes extracted from video`);
            return null;
        }

        console.log(`[Video Analyzer] Extracted ${base64Frames.length} frames. Sending to Gemini 3.5 Flash...`);

        // 3. Lookup Gemini API Key
        let apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            const dbKey = await prisma.apiKey.findUnique({ where: { service: "gemini_api_key" } });
            if (dbKey?.key) apiKey = Buffer.from(dbKey.key, "base64").toString("utf8");
        }

        if (!apiKey) {
            console.error(`[Video Analyzer] GEMINI_API_KEY not configured`);
            return null;
        }

        // 4. Construct Gemini request payload
        const imageParts = base64Frames.map(b64 => ({
            inlineData: {
                mimeType: "image/png",
                data: b64
            }
        }));

        const promptText = `Analyze these sequential video frames extracted from a children's video. 
        You are a visual continuity director. Your goal is to:
        1. Count and identify the main recurring characters in the video frames.
        2. Describe the physical appearance of each main character in rich, consistent visual detail (attire, features, expression, colors) optimized for 3D animation prompts.
        3. Outline the visual scene beats occurring throughout the sequence.

        Respond ONLY with a valid JSON object matching this schema, no markdown wrapping:
        {
          "headcount": 2,
          "detectedCharacters": [
            {
              "name": "Character Name",
              "prompt": "Visual prompt description (e.g. 'A Pixar-style 3D CGI animation of a young boy with messy brown hair, blue eyes, wearing a blue t-shirt, cheerful smile')"
            }
          ],
          "sceneBeats": [
            {
              "sceneIndex": 1,
              "description": "Visual actions described cleanly"
            }
          ]
        }`;

        const promptPart = { text: promptText };

        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [
                        {
                            role: "user",
                            parts: [...imageParts, promptPart]
                        }
                    ],
                    generationConfig: {
                        temperature: 0.2,
                        responseMimeType: "application/json"
                    }
                })
            }
        );

        if (!res.ok) {
            throw new Error(`Gemini API returned status ${res.status}: ${await res.text()}`);
        }

        const json = await res.json();
        const content = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!content) {
            throw new Error("Empty response from Gemini");
        }

        let cleaned = content;
        if (cleaned.startsWith("```")) {
            cleaned = cleaned.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
        }

        const parsed = JSON.parse(cleaned) as VisualAnalysisResult;
        console.log(`[Video Analyzer] Analysis successful for video ${videoId}. Characters found:`, parsed.headcount);
        
        // 5. Save the analysis JSON directly inside the video description field
        await prisma.video.update({
            where: { id: videoId },
            data: {
                description: JSON.stringify(parsed)
            }
        });

        return parsed;

    } catch (err: any) {
        console.error(`[Video Analyzer] Visual analysis failed:`, err.message);
        return null;
    }
}
