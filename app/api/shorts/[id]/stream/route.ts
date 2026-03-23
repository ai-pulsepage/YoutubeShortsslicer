import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

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
 * GET /api/shorts/[id]/stream
 * Stream a rendered short video from R2 with range support
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

    const short = await prisma.shortVideo.findUnique({
        where: { id },
        include: {
            segment: {
                select: {
                    title: true,
                    video: { select: { userId: true, title: true } },
                },
            },
        },
    });

    if (!short || short.segment.video.userId !== session.user.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!short.storagePath) {
        return NextResponse.json({ error: "No video file" }, { status: 404 });
    }

    try {
        const range = req.headers.get("range");
        const s3Params: any = {
            Bucket: BUCKET,
            Key: short.storagePath,
        };

        if (range) {
            s3Params.Range = range;
        }

        const response = await s3.send(new GetObjectCommand(s3Params));

        // Build a safe filename from the segment/clip title
        const segmentTitle = short.segment?.title || short.segment?.video?.title || "short";
        const safeFilename = segmentTitle.replace(/[^a-zA-Z0-9_\- ]/g, "").substring(0, 80).trim() || "short";

        const headers: Record<string, string> = {
            "Content-Type": response.ContentType || "video/mp4",
            "Content-Disposition": `attachment; filename="${safeFilename}.mp4"`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=86400",
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

        const webStream = (body as any).transformToWebStream();

        return new Response(webStream, {
            status: range ? 206 : 200,
            headers,
        });
    } catch (error: any) {
        console.error("[Shorts Stream] Error:", error.message);
        return NextResponse.json(
            { error: "Failed to stream video" },
            { status: 500 }
        );
    }
}
