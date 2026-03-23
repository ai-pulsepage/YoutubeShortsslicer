import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET  /api/briefs — List all campaign briefs for the current user
 * POST /api/briefs — Create a new campaign brief
 */

export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const briefs = await prisma.campaignBrief.findMany({
        where: {
            userId: session.user.id,
            status: { not: "archived" },
        },
        orderBy: { createdAt: "desc" },
        include: {
            _count: { select: { clipProjects: true } },
        },
    });

    return NextResponse.json(briefs);
}

export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, brand, ...rest } = body;

    if (!name) {
        return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });
    }

    const brief = await prisma.campaignBrief.create({
        data: {
            userId: session.user.id,
            name,
            brand: brand || null,
            // Content Source
            contentSourceUrls: rest.contentSourceUrls || [],
            contentSourceNotes: rest.contentSourceNotes || null,
            // Platforms
            targetPlatforms: rest.targetPlatforms || [],
            // Caption
            captionGuidelines: rest.captionGuidelines || null,
            suggestedCaptions: rest.suggestedCaptions || [],
            // Tags
            platformTags: rest.platformTags || [],
            requiredHashtags: rest.requiredHashtags || [],
            optionalHashtags: rest.optionalHashtags || [],
            // Disclosure
            disclosureRequired: rest.disclosureRequired || false,
            disclosureOptions: rest.disclosureOptions || [],
            disclosurePlacement: rest.disclosurePlacement || null,
            // On-Screen
            onScreenTextNotes: rest.onScreenTextNotes || null,
            onScreenSuggestions: rest.onScreenSuggestions || [],
            // Video Settings
            formatNotes: rest.formatNotes || null,
            minLengthSec: rest.minLengthSec || null,
            maxLengthSec: rest.maxLengthSec || null,
            // Watermark
            watermarkRequired: rest.watermarkRequired || false,
            watermarkUrl: rest.watermarkUrl || null,
            watermarkNotes: rest.watermarkNotes || null,
            // Subtitle
            subtitleStyle: rest.subtitleStyle || null,
            // Monetization
            cpmRate: rest.cpmRate ? parseFloat(rest.cpmRate) : null,
            engagementRateMin: rest.engagementRateMin ? parseFloat(rest.engagementRateMin) : null,
            minPostDays: rest.minPostDays ? parseInt(rest.minPostDays) : null,
            // Requirements
            requirements: rest.requirements || [],
            notAllowed: rest.notAllowed || [],
        },
    });

    return NextResponse.json(brief, { status: 201 });
}
