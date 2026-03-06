import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import {
    S3Client,
    GetObjectCommand,
} from "@aws-sdk/client-s3";

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
 * GET /api/videos/[id]/stream
 * Proxy video content from R2 with range request support
 */
export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const video = await prisma.video.findFirst({
        where: { id, userId: session.user.id },
        select: { storagePath: true },
    });

    if (!video?.storagePath) {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    try {
        const range = req.headers.get("range");
        const s3Params: any = {
            Bucket: BUCKET,
            Key: video.storagePath,
        };

        if (range) {
            s3Params.Range = range;
        }

        const response = await s3.send(new GetObjectCommand(s3Params));

        const headers: Record<string, string> = {
            "Content-Type": response.ContentType || "video/mp4",
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600",
        };

        if (response.ContentLength) {
            headers["Content-Length"] = response.ContentLength.toString();
        }
        if (response.ContentRange) {
            headers["Content-Range"] = response.ContentRange;
        }

        const body = response.Body;
        if (!body) {
            return NextResponse.json({ error: "Empty response" }, { status: 500 });
        }

        // Convert AWS SDK stream to web ReadableStream
        const webStream = (body as any).transformToWebStream();

        return new Response(webStream, {
            status: range ? 206 : 200,
            headers,
        });
    } catch (error: any) {
        console.error("[Stream] Error:", error.message);
        return NextResponse.json(
            { error: "Failed to stream video" },
            { status: 500 }
        );
    }
}
