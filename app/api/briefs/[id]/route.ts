import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET    /api/briefs/[id] — Get a single campaign brief with linked projects
 * PATCH  /api/briefs/[id] — Update a campaign brief
 * DELETE /api/briefs/[id] — Archive a campaign brief
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

    const brief = await prisma.campaignBrief.findFirst({
        where: { id, userId: session.user.id },
        include: {
            clipProjects: {
                include: {
                    video: {
                        select: { id: true, title: true, thumbnail: true, duration: true, status: true },
                    },
                },
                orderBy: { createdAt: "desc" },
            },
            _count: { select: { clipProjects: true } },
        },
    });

    if (!brief) {
        return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    }

    return NextResponse.json(brief);
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    // Verify ownership
    const existing = await prisma.campaignBrief.findFirst({
        where: { id, userId: session.user.id },
    });
    if (!existing) {
        return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    }

    // Only update fields that are provided
    const updateData: Record<string, any> = {};
    const fields = [
        "name", "brand", "status",
        "contentSourceUrls", "contentSourceNotes",
        "targetPlatforms",
        "captionGuidelines", "suggestedCaptions",
        "platformTags", "requiredHashtags", "optionalHashtags",
        "disclosureRequired", "disclosureOptions", "disclosurePlacement",
        "onScreenTextNotes", "onScreenSuggestions",
        "formatNotes", "minLengthSec", "maxLengthSec",
        "watermarkRequired", "watermarkUrl", "watermarkNotes",
        "subtitleStyle",
        "cpmRate", "engagementRateMin", "minPostDays",
        "requirements", "notAllowed",
    ];

    for (const field of fields) {
        if (body[field] !== undefined) {
            updateData[field] = body[field];
        }
    }

    const updated = await prisma.campaignBrief.update({
        where: { id },
        data: updateData,
    });

    return NextResponse.json(updated);
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.campaignBrief.findFirst({
        where: { id, userId: session.user.id },
    });
    if (!existing) {
        return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    }

    // Soft-delete: archive instead of destroying
    await prisma.campaignBrief.update({
        where: { id },
        data: { status: "archived" },
    });

    return NextResponse.json({ ok: true });
}
