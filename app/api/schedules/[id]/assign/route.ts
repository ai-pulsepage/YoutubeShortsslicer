import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/schedules/[id]/assign
 *
 * Batch-assign rendered short videos to a schedule.
 * Auto-fills posting slots based on the schedule's postTimes.
 *
 * Body: { shortVideoIds: string[] }
 */
export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: scheduleId } = await params;
    const { shortVideoIds } = await req.json();

    if (!shortVideoIds || !Array.isArray(shortVideoIds) || shortVideoIds.length === 0) {
        return NextResponse.json(
            { error: "shortVideoIds array is required" },
            { status: 400 }
        );
    }

    // Load schedule
    const schedule = await prisma.contentSchedule.findFirst({
        where: { id: scheduleId, userId: session.user.id },
        include: { channel: { select: { id: true } } },
    });

    if (!schedule) {
        return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    // Get the posting times from the schedule
    const postTimes = (schedule.postTimes as string[]) || ["09:00", "13:00", "18:00"];

    // Find the last scheduled job for this schedule to determine the next slot
    const lastJob = await prisma.publishJob.findFirst({
        where: { scheduleId },
        orderBy: { scheduledAt: "desc" },
        select: { scheduledAt: true },
    });

    let nextSlotDate = lastJob?.scheduledAt ? new Date(lastJob.scheduledAt) : new Date();
    let currentTimeIndex = 0;

    // If starting from now, find the next available time slot today
    if (!lastJob?.scheduledAt) {
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();

        let foundToday = false;
        for (let i = 0; i < postTimes.length; i++) {
            const [h, m] = postTimes[i].split(":").map(Number);
            const slotMinutes = h * 60 + m;
            if (slotMinutes > nowMinutes) {
                currentTimeIndex = i;
                foundToday = true;
                break;
            }
        }

        if (!foundToday) {
            // All slots today have passed, start tomorrow
            nextSlotDate = new Date(now);
            nextSlotDate.setDate(nextSlotDate.getDate() + 1);
            currentTimeIndex = 0;
        }
    } else {
        // Find which time index was last used
        const lastHour = nextSlotDate.getHours();
        const lastMin = nextSlotDate.getMinutes();
        const lastTimeStr = `${String(lastHour).padStart(2, "0")}:${String(lastMin).padStart(2, "0")}`;

        currentTimeIndex = postTimes.indexOf(lastTimeStr);
        if (currentTimeIndex === -1) currentTimeIndex = 0;

        // Move to next slot
        currentTimeIndex++;
        if (currentTimeIndex >= postTimes.length) {
            currentTimeIndex = 0;
            nextSlotDate.setDate(nextSlotDate.getDate() + 1);
        }
    }

    // Create publish jobs for each short video
    const created = [];

    for (const shortVideoId of shortVideoIds) {
        // Calculate the scheduled time
        const [hours, minutes] = postTimes[currentTimeIndex].split(":").map(Number);
        const scheduledAt = new Date(nextSlotDate);
        scheduledAt.setHours(hours, minutes, 0, 0);

        // Get the segment title for the publish job title
        const shortVideo = await prisma.shortVideo.findUnique({
            where: { id: shortVideoId },
            include: { segment: { select: { title: true, description: true } } },
        });

        const job = await prisma.publishJob.create({
            data: {
                shortVideoId,
                channelId: schedule.channel.id,
                scheduleId,
                title: shortVideo?.segment.title || "Short",
                description: shortVideo?.segment.description || "",
                hashtags: ["Shorts"],
                scheduledAt,
                status: "SCHEDULED",
            },
        });

        created.push({
            jobId: job.id,
            shortVideoId,
            scheduledAt,
            timeSlot: postTimes[currentTimeIndex],
        });

        // Advance to next time slot
        currentTimeIndex++;
        if (currentTimeIndex >= postTimes.length) {
            currentTimeIndex = 0;
            nextSlotDate.setDate(nextSlotDate.getDate() + 1);
        }
    }

    return NextResponse.json({
        assigned: created.length,
        scheduleId,
        jobs: created,
    });
}
