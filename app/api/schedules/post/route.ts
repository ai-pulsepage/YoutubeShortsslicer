import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const {
            channelId,
            shortVideoId,
            documentaryId,
            ugcJobId,
            podcastEpisodeId,
            title,
            description,
            hashtags,
            scheduledAt,
        } = await req.json();

        if (!channelId) {
            return NextResponse.json({ error: "channelId is required" }, { status: 400 });
        }

        // Verify channel ownership
        const channel = await prisma.channel.findFirst({
            where: { id: channelId, userId: session.user.id },
        });
        if (!channel) {
            return NextResponse.json({ error: "Channel not found" }, { status: 404 });
        }

        const job = await prisma.publishJob.create({
            data: {
                channelId,
                shortVideoId: shortVideoId || null,
                documentaryId: documentaryId || null,
                ugcJobId: ugcJobId || null,
                podcastEpisodeId: podcastEpisodeId || null,
                title: title || "Scheduled Post",
                description: description || "",
                hashtags: hashtags || [],
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                status: scheduledAt ? "SCHEDULED" : "DRAFT",
            }
        });

        return NextResponse.json({ success: true, jobId: job.id });
    } catch (err: any) {
        console.error("[Schedule Single Post] failed:", err.message);
        return NextResponse.json({ error: "Failed to schedule post", details: err.message }, { status: 500 });
    }
}
