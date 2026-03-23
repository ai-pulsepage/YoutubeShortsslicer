import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * POST /api/briefs/[id]/build-description
 * 
 * Assembles a compliant post description from the campaign brief.
 * Input:  { clipTitle, platform }
 * Output: { description, warnings[], selectedCaption }
 * 
 * Description format:
 *   [Suggested Caption] [Clip Title]
 *   
 *   [Disclosure on its own line, if required]
 *   
 *   [Platform tags]
 *   [Required hashtags] [Optional hashtags]
 */

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { clipTitle, platform } = body;

    const brief = await prisma.campaignBrief.findFirst({
        where: { id, userId: session.user.id },
    });

    if (!brief) {
        return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    }

    const warnings: string[] = [];
    const parts: string[] = [];

    // 1. Build the first line: [Suggested Caption] + [Clip Title]
    let selectedCaption = "";
    if (brief.suggestedCaptions.length > 0) {
        // Randomly pick one suggested caption
        const idx = Math.floor(Math.random() * brief.suggestedCaptions.length);
        selectedCaption = brief.suggestedCaptions[idx];
    }

    const firstLine = [selectedCaption, clipTitle || ""].filter(Boolean).join(" ");
    if (firstLine) {
        parts.push(firstLine);
    }

    // 2. Check required phrases against the assembled first line
    if ((brief as any).requiredPhrasesMode === "pick-one") {
        const hasAny = brief.requiredPhrases.some(
            (phrase) => firstLine.toLowerCase().includes(phrase.toLowerCase())
        );
        if (brief.requiredPhrases.length > 0 && !hasAny) {
            warnings.push(`Caption should mention at least one of: ${brief.requiredPhrases.map(p => `"${p}"`).join(", ")}`);
        }
    } else {
        for (const phrase of brief.requiredPhrases) {
            if (!firstLine.toLowerCase().includes(phrase.toLowerCase())) {
                warnings.push(`Caption should mention: "${phrase}"`);
            }
        }
    }

    // 3. Disclosure (on its own line)
    if (brief.disclosureRequired && brief.disclosureOptions.length > 0) {
        parts.push(""); // blank line
        parts.push(brief.disclosureOptions[0]); // e.g. #Ad
    }

    // 4. Platform tags (e.g., @callofduty)
    const platformTagEntry = (brief.platformTags as any[])?.find(
        (t: any) => t.platform?.toLowerCase() === platform?.toLowerCase()
    );
    if (platformTagEntry?.tags?.length > 0) {
        parts.push(""); // blank line
        parts.push(platformTagEntry.tags.join(" "));
    }

    // 5. Required hashtags + optional hashtags
    const allHashtags = [
        ...brief.requiredHashtags,
        ...brief.optionalHashtags,
    ].filter(Boolean);
    if (allHashtags.length > 0) {
        parts.push(""); // blank line
        parts.push(allHashtags.join(" "));
    }

    const description = parts.join("\n");

    // Validate required hashtags are present
    for (const hashtag of brief.requiredHashtags) {
        if (!description.includes(hashtag)) {
            warnings.push(`Missing required hashtag: ${hashtag}`);
        }
    }

    return NextResponse.json({
        description,
        warnings,
        selectedCaption,
        suggestedCaptions: brief.suggestedCaptions,
    });
}
