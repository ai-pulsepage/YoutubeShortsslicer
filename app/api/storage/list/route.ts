import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT || "",
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    },
});

const BUCKET = process.env.R2_BUCKET_NAME || "youtubeshorts";

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const prefix = req.nextUrl.searchParams.get("prefix") || "";
        const command = new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: prefix,
            Delimiter: "/",
        });

        const response = await s3.send(command);

        const folders = (response.CommonPrefixes || []).map(p => p.Prefix).filter(Boolean);
        const files = (response.Contents || [])
            .filter(c => c.Key !== prefix) // Exclude the directory prefix itself if it matches exactly
            .map(c => ({
                key: c.Key,
                size: c.Size,
                lastModified: c.LastModified,
            }));

        return NextResponse.json({ success: true, folders, files });
    } catch (err: any) {
        console.error("[Storage List GET] failed:", err.message);
        return NextResponse.json({ error: "Failed to list storage objects", details: err.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { key } = await req.json();
        if (!key) return NextResponse.json({ error: "Missing file key" }, { status: 400 });

        const command = new DeleteObjectCommand({
            Bucket: BUCKET,
            Key: key,
        });

        await s3.send(command);
        return NextResponse.json({ success: true, message: `Successfully deleted ${key}` });
    } catch (err: any) {
        console.error("[Storage DELETE] failed:", err.message);
        return NextResponse.json({ error: "Failed to delete storage object", details: err.message }, { status: 500 });
    }
}
