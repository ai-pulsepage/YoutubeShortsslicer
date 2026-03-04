import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable } from "stream";
import fs from "fs";
import path from "path";

const s3 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT || "",
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    },
});

const BUCKET = process.env.R2_BUCKET_NAME || "youtubeshorts";

/**
 * Upload a file to R2 from a local path
 */
export async function uploadFileToR2(
    localPath: string,
    r2Key: string,
    contentType?: string
): Promise<string> {
    const fileStream = fs.createReadStream(localPath);
    const fileSize = fs.statSync(localPath).size;

    // Use multipart upload for files > 5MB
    if (fileSize > 5 * 1024 * 1024) {
        const upload = new Upload({
            client: s3,
            params: {
                Bucket: BUCKET,
                Key: r2Key,
                Body: fileStream,
                ContentType: contentType || "application/octet-stream",
            },
            queueSize: 4,
            partSize: 10 * 1024 * 1024, // 10MB parts
        });

        await upload.done();
    } else {
        const body = fs.readFileSync(localPath);
        await s3.send(
            new PutObjectCommand({
                Bucket: BUCKET,
                Key: r2Key,
                Body: body,
                ContentType: contentType || "application/octet-stream",
            })
        );
    }

    return r2Key;
}

/**
 * Upload a buffer to R2
 */
export async function uploadBufferToR2(
    buffer: Buffer,
    r2Key: string,
    contentType: string
): Promise<string> {
    await s3.send(
        new PutObjectCommand({
            Bucket: BUCKET,
            Key: r2Key,
            Body: buffer,
            ContentType: contentType,
        })
    );

    return r2Key;
}

/**
 * Get a presigned-like public URL (R2 public bucket or custom domain)
 */
export function getR2PublicUrl(r2Key: string): string {
    // If R2 public domain is configured
    const publicDomain = process.env.R2_PUBLIC_URL;
    if (publicDomain) {
        return `${publicDomain}/${r2Key}`;
    }
    // Fallback: direct endpoint URL
    return `${process.env.R2_ENDPOINT}/${BUCKET}/${r2Key}`;
}

/**
 * Delete a file from R2
 */
export async function deleteFromR2(r2Key: string): Promise<void> {
    await s3.send(
        new DeleteObjectCommand({
            Bucket: BUCKET,
            Key: r2Key,
        })
    );
}

/**
 * Generate a unique R2 key for a video file
 */
export function generateR2Key(
    userId: string,
    videoId: string,
    filename: string
): string {
    const ext = path.extname(filename) || ".mp4";
    return `videos/${userId}/${videoId}/source${ext}`;
}

/**
 * Generate R2 key for audio extract
 */
export function generateAudioR2Key(
    userId: string,
    videoId: string
): string {
    return `videos/${userId}/${videoId}/audio.wav`;
}

/**
 * Generate R2 key for a rendered short
 */
export function generateShortR2Key(
    userId: string,
    videoId: string,
    segmentId: string
): string {
    return `shorts/${userId}/${videoId}/${segmentId}.mp4`;
}
