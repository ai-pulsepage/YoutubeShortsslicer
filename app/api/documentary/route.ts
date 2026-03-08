/**
 * Documentary CRUD API
 * 
 * GET  /api/documentary         — List all documentaries (with filters)
 * POST /api/documentary         — Create new documentary project
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const where: Record<string, unknown> = { userId: session.user.id };
    if (status) {
        where.status = status;
    }

    const documentaries = await prisma.documentary.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
            _count: {
                select: {
                    scenes: true,
                    assets: true,
                    genJobs: true,
                },
            },
        },
    });

    return NextResponse.json(documentaries);
}

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { sourceUrls, style, styleGuide, voiceId, title } = body;

    if (!sourceUrls || !Array.isArray(sourceUrls) || sourceUrls.length === 0) {
        return NextResponse.json(
            { error: "At least one source URL is required" },
            { status: 400 }
        );
    }

    const documentary = await prisma.documentary.create({
        data: {
            userId: session.user.id,
            title: title || null,
            sourceUrls,
            style: style || "cinematic",
            styleGuide: styleGuide || null,
            voiceId: voiceId || "bf_emma",
            status: "DRAFT",
        },
    });

    return NextResponse.json(documentary);
}
