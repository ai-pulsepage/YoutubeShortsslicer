import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * POST /api/videos/metadata
 * Fetch video metadata (title, thumbnail, duration) without downloading
 * Uses yt-dlp --dump-json for zero-download metadata extraction
 */
export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { url } = await req.json();
    if (!url?.trim()) {
        return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    try {
        // Use yt-dlp to get metadata without downloading
        const { execSync } = require("child_process");
        const result = execSync(
            `yt-dlp --dump-json --no-download "${url.trim()}"`,
            {
                encoding: "utf8",
                timeout: 30000,
                maxBuffer: 10 * 1024 * 1024,
            }
        );

        const metadata = JSON.parse(result);

        return NextResponse.json({
            title: metadata.title || "Untitled",
            thumbnail: metadata.thumbnail || null,
            duration: metadata.duration || null,
            uploader: metadata.uploader || metadata.channel || null,
            uploadDate: metadata.upload_date || null,
            viewCount: metadata.view_count || null,
            description: metadata.description?.slice(0, 500) || null,
            platform: detectPlatform(url),
        });
    } catch (error: any) {
        // Check if yt-dlp is not installed
        if (
            error.message?.includes("ENOENT") ||
            error.message?.includes("not recognized")
        ) {
            return NextResponse.json(
                {
                    error: "yt-dlp not installed",
                    message:
                        "Install yt-dlp: pip install yt-dlp or download from github.com/yt-dlp/yt-dlp",
                },
                { status: 503 }
            );
        }

        return NextResponse.json(
            { error: "Failed to fetch metadata", details: error.message },
            { status: 500 }
        );
    }
}

function detectPlatform(url: string): string {
    const u = url.toLowerCase();
    if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
    if (u.includes("vimeo.com")) return "vimeo";
    if (u.includes("tiktok.com")) return "tiktok";
    if (u.includes("instagram.com")) return "instagram";
    if (u.includes("twitch.tv")) return "twitch";
    if (u.includes("twitter.com") || u.includes("x.com")) return "twitter";
    return "other";
}
