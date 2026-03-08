/**
 * Documentary Publish API
 *
 * POST /api/documentary/[id]/publish
 *
 * Generates AI descriptions and pushes to connected channels.
 * OR generates descriptions for preview without publishing.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateDescription, type Platform } from "@/lib/ai-descriptions";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const action = body.action || "generate"; // "generate" = AI descriptions, "publish" = push to channel

    const doc = await prisma.documentary.findUnique({
        where: { id, userId: session.user.id },
        include: {
            scenes: {
                orderBy: { sceneIndex: "asc" },
                select: { narrationText: true, title: true },
            },
        },
    });

    if (!doc) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (action === "generate") {
        // Generate AI descriptions for different platforms
        const platform: Platform = body.platform || "YOUTUBE";

        // Build a summary from the script for better descriptions
        const scriptExcerpt = doc.script
            ? doc.script.substring(0, 500).replace(/\[VISUAL:.*?\]/g, "").trim()
            : doc.scenes.map((s: { narrationText: string | null }) => s.narrationText).filter(Boolean).join(" ").substring(0, 500);

        const description = await generateDescription({
            segmentTitle: doc.title || "Documentary",
            segmentDescription: scriptExcerpt,
            sourceVideoTitle: doc.title || undefined,
            platform,
        });

        return NextResponse.json({
            title: description.title,
            description: description.description,
            hashtags: description.hashtags,
            platform: description.platform,
        });
    }

    if (action === "approve") {
        // Mark as approved
        await prisma.documentary.update({
            where: { id },
            data: { status: "APPROVED" },
        });
        return NextResponse.json({ status: "APPROVED" });
    }

    if (action === "publish") {
        // Mark as published
        if (!doc.finalVideoPath) {
            return NextResponse.json(
                { error: "No final video — assemble first" },
                { status: 400 }
            );
        }

        await prisma.documentary.update({
            where: { id },
            data: { status: "PUBLISHED" },
        });

        return NextResponse.json({
            status: "PUBLISHED",
            videoPath: doc.finalVideoPath,
            message: "Documentary marked as published. Use the Scheduler page to connect to YouTube/TikTok channels.",
        });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
