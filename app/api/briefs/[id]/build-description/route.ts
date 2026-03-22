import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * POST /api/briefs/[id]/build-description
 * 
 * Assembles a compliant post description from the campaign brief.
 * Input:  { captionText, platform }
 * Output: { description, warnings[] }
 * 
 * Description format:
 *   [Caption text]
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
    const { captionText, platform } = body;

    const brief = await prisma.campaignBrief.findFirst({
        where: { id, userId: session.user.id },
    });

    if (!brief) {
        return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    }

    const warnings: string[] = [];
    const parts: string[] = [];

    // 1. Caption text
    const caption = captionText || (brief.suggestedCaptions.length > 0 ? brief.suggestedCaptions[0] : "");
    if (caption) {
        parts.push(caption);
    }

    // 2. Check required phrases
    for (const phrase of brief.requiredPhrases) {
        if (!caption.toLowerCase().includes(phrase.toLowerCase())) {
            warnings.push(`Caption should mention: "${phrase}"`);
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

    // 5. Required hashtags
    if (brief.requiredHashtags.length > 0) {
        const hashtagLine = brief.requiredHashtags.join(" ");
        // Add optional hashtags if any
        const optionals = brief.optionalHashtags.length > 0
            ? " " + brief.optionalHashtags.join(" ")
            : "";
        parts.push(hashtagLine + optionals);
    }

    const description = parts.join("\n");

    // Validate the final description
    for (const hashtag of brief.requiredHashtags) {
        if (!description.includes(hashtag)) {
            warnings.push(`Missing required hashtag: ${hashtag}`);
        }
    }

    return NextResponse.json({
        description,
        warnings,
        suggestedCaptions: brief.suggestedCaptions,
    });
}
