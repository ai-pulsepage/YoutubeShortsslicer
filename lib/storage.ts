import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command,
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
 * Download a file from R2 to a local path
 */
export async function downloadFileFromR2(
    r2Key: string,
    localPath: string
): Promise<void> {
    const response = await s3.send(
        new GetObjectCommand({
            Bucket: BUCKET,
            Key: r2Key,
        })
    );

    if (!response.Body) {
        throw new Error(`No body returned for R2 key: ${r2Key}`);
    }

    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const writeStream = fs.createWriteStream(localPath);
    const readable = response.Body as Readable;

    await new Promise<void>((resolve, reject) => {
        readable.pipe(writeStream);
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
        readable.on("error", reject);
    });
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

/**
 * Batch delete multiple R2 objects (max 1000 per request)
 */
export async function deleteMultipleFromR2(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;

    let deleted = 0;
    // S3 DeleteObjects supports max 1000 keys per request
    for (let i = 0; i < keys.length; i += 1000) {
        const batch = keys.slice(i, i + 1000);
        await s3.send(
            new DeleteObjectsCommand({
                Bucket: BUCKET,
                Delete: {
                    Objects: batch.map((key) => ({ Key: key })),
                    Quiet: true,
                },
            })
        );
        deleted += batch.length;
    }
    return deleted;
}

/**
 * List R2 objects under a prefix
 */
export async function listR2Objects(prefix: string): Promise<{ key: string; size: number; lastModified: Date }[]> {
    const objects: { key: string; size: number; lastModified: Date }[] = [];
    let continuationToken: string | undefined;

    do {
        const response = await s3.send(
            new ListObjectsV2Command({
                Bucket: BUCKET,
                Prefix: prefix,
                ContinuationToken: continuationToken,
                MaxKeys: 1000,
            })
        );

        for (const obj of response.Contents || []) {
            if (obj.Key) {
                objects.push({
                    key: obj.Key,
                    size: obj.Size || 0,
                    lastModified: obj.LastModified || new Date(),
                });
            }
        }

        continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return objects;
}

/**
 * Get R2 storage stats for documentary assets
 */
export async function getR2StorageStats(): Promise<{
    totalObjects: number;
    totalSizeBytes: number;
    totalSizeMB: string;
    prefixes: Record<string, { count: number; sizeMB: string }>;
}> {
    const objects = await listR2Objects("documentaries/");
    const totalSizeBytes = objects.reduce((sum, o) => sum + o.size, 0);

    // Group by sub-prefix (assets vs clips vs other)
    const prefixMap: Record<string, { count: number; sizeBytes: number }> = {};
    for (const obj of objects) {
        const parts = obj.key.split("/");
        const prefix = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
        if (!prefixMap[prefix]) prefixMap[prefix] = { count: 0, sizeBytes: 0 };
        prefixMap[prefix].count++;
        prefixMap[prefix].sizeBytes += obj.size;
    }

    const prefixes: Record<string, { count: number; sizeMB: string }> = {};
    for (const [p, data] of Object.entries(prefixMap)) {
        prefixes[p] = { count: data.count, sizeMB: (data.sizeBytes / (1024 * 1024)).toFixed(2) };
    }

    return {
        totalObjects: objects.length,
        totalSizeBytes,
        totalSizeMB: (totalSizeBytes / (1024 * 1024)).toFixed(2),
        prefixes,
    };
}
