import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { uploadFileToR2, generateR2Key, generateAudioR2Key } from "@/lib/storage";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";
import path from "path";
import fs from "fs";
import os from "os";
import { execSync } from "child_process";

const TEMP_DIR = path.join(os.tmpdir(), "yt-shorts-slicer");

/**
 * POST /api/clipper/upload — Direct file upload for non-YouTube sources
 *
 * Handles multipart form data with a video file + metadata.
 * Uploads to R2, extracts audio, and queues transcription pipeline.
 */
export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        const title = (formData.get("title") as string) || "Uploaded Video";
        const campaignName = formData.get("campaignName") as string | null;
        const campaignCpm = formData.get("campaignCpm") as string | null;
        const captionStyle = (formData.get("captionStyle") as string) || "word-highlight";
        const faceTrack = formData.get("faceTrack") !== "false";

        if (!file || !file.size) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        // Validate file type
        const allowedTypes = ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"];
        if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp4|mov|webm|mkv)$/i)) {
            return NextResponse.json(
                { error: "Invalid file type. Supported: mp4, mov, webm, mkv" },
                { status: 400 }
            );
        }

        // Max size: 2GB
        if (file.size > 2 * 1024 * 1024 * 1024) {
            return NextResponse.json(
                { error: "File too large. Maximum 2GB." },
                { status: 400 }
            );
        }

        console.log(`[Upload] Received: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);

        // Step 1: Create Video record
        const video = await prisma.video.create({
            data: {
                userId: session.user.id,
                sourceUrl: `upload://${file.name}`,
                platform: "upload",
                title,
                status: "DOWNLOADING", // We'll update to TRANSCRIBING after upload
            },
        });

        // Step 2: Create ClipProject
        const project = await prisma.clipProject.create({
            data: {
                userId: session.user.id,
                videoId: video.id,
                campaignName: campaignName || null,
                campaignCpm: campaignCpm ? parseFloat(campaignCpm) : null,
                captionStyle,
                faceTrack,
            },
        });

        // Step 3: Save file to temp directory
        const videoDir = path.join(TEMP_DIR, video.id);
        if (!fs.existsSync(videoDir)) {
            fs.mkdirSync(videoDir, { recursive: true });
        }

        const ext = path.extname(file.name) || ".mp4";
        const localVideoPath = path.join(videoDir, `upload${ext}`);
        const buffer = Buffer.from(await file.arrayBuffer());
        fs.writeFileSync(localVideoPath, buffer);

        console.log(`[Upload] Saved to: ${localVideoPath}`);

        // Step 4: Upload to R2
        const r2Key = generateR2Key(session.user.id, video.id, `upload${ext}`);
        await uploadFileToR2(localVideoPath, r2Key, file.type || "video/mp4");

        // Step 5: Get video duration via FFprobe
        let duration = 0;
        try {
            const durationStr = execSync(
                `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${localVideoPath}"`,
                { encoding: "utf8", timeout: 30000 }
            ).trim();
            duration = Math.round(parseFloat(durationStr) || 0);
        } catch {
            console.warn("[Upload] Could not determine duration via ffprobe");
        }

        // Step 6: Extract audio for transcription
        const audioPath = path.join(videoDir, "audio.wav");
        const audioR2Key = generateAudioR2Key(session.user.id, video.id);
        try {
            execSync(
                `ffmpeg -i "${localVideoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}" -y`,
                { timeout: 300000 }
            );
            await uploadFileToR2(audioPath, audioR2Key, "audio/wav");
        } catch (err: any) {
            console.warn("[Upload] Audio extraction failed:", err.message);
        }

        // Step 7: Update Video record
        await prisma.video.update({
            where: { id: video.id },
            data: {
                title,
                duration,
                storagePath: r2Key,
                status: "TRANSCRIBING",
            },
        });

        // Step 8: Queue transcription (skips download worker entirely)
        const transcriptionQueue = getQueue(QUEUE_NAMES.TRANSCRIPTION);
        await transcriptionQueue.add(`transcribe-${video.id}`, {
            videoId: video.id,
            userId: session.user.id,
            audioStoragePath: audioR2Key,
            autoSegment: true,
            clipMode: true,
            clipProjectId: project.id,
        });

        // Cleanup temp files
        try {
            fs.rmSync(videoDir, { recursive: true, force: true });
        } catch {}

        console.log(`[Upload] Complete: ${video.id} → queued for transcription`);

        return NextResponse.json(
            {
                projectId: project.id,
                videoId: video.id,
                title,
                duration,
                status: "TRANSCRIBING",
                message: "Video uploaded — transcription started",
            },
            { status: 201 }
        );
    } catch (error: any) {
        console.error("[Upload] Error:", error.message);
        return NextResponse.json(
            { error: `Upload failed: ${error.message}` },
            { status: 500 }
        );
    }
}
