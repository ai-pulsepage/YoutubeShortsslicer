import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateDescription, Platform } from "@/lib/ai-descriptions";

/**
 * POST /api/generate-description
 * Generate AI-powered platform-specific title, description, and hashtags.
 *
 * Body: {
 *   segmentTitle: string,
 *   segmentDescription?: string,
 *   transcriptExcerpt?: string,
 *   sourceVideoTitle?: string,
 *   platform: "YOUTUBE" | "INSTAGRAM" | "TIKTOK" | "GENERIC"
 * }
 */
export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const platform = (body.platform || "YOUTUBE") as Platform;

    // Try to get API key from DB first, then env
    let apiKey = process.env.TOGETHER_API_KEY;
    try {
        const dbKey = await prisma.apiKey.findFirst({
            where: { service: "together_api_key", isActive: true },
        });
        if (dbKey) {
            apiKey = Buffer.from(dbKey.key, "base64").toString("utf-8");
        }
    } catch { }

    const result = await generateDescription(
        {
            segmentTitle: body.segmentTitle || "Untitled",
            segmentDescription: body.segmentDescription,
            transcriptExcerpt: body.transcriptExcerpt,
            sourceVideoTitle: body.sourceVideoTitle,
            platform,
        },
        apiKey
    );

    return NextResponse.json(result);
}
