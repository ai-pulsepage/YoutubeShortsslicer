import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/jobs/cleanup
 * Reset stuck/zombie jobs that have been in processing state for too long.
 * Admin-only endpoint.
 */
export async function POST() {
    const session = await auth();
    if (!session?.user?.id || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cutoff = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

    try {
        // Reset stuck videos (PENDING, DOWNLOADING, TRANSCRIBING, SEGMENTING)
        const stuckVideos = await prisma.video.updateMany({
            where: {
                status: { in: ["PENDING", "DOWNLOADING", "TRANSCRIBING", "SEGMENTING"] },
                updatedAt: { lt: cutoff },
            },
            data: {
                status: "FAILED",
                errorMsg: "Timed out — marked as failed by admin cleanup",
            },
        });

        // Reset stuck segments (RENDERING)
        const stuckSegments = await prisma.segment.updateMany({
            where: {
                status: "RENDERING",
                updatedAt: { lt: cutoff },
            },
            data: {
                status: "FAILED",
            },
        });

        // Reset stuck short videos (PENDING, RENDERING)
        const stuckShorts = await prisma.shortVideo.updateMany({
            where: {
                status: { in: ["PENDING", "RENDERING"] },
                updatedAt: { lt: cutoff },
            },
            data: {
                status: "FAILED",
                errorMsg: "Timed out — marked as failed by admin cleanup",
            },
        });

        // Reset stuck documentaries (GENERATING, ASSEMBLING)
        const stuckDocs = await prisma.documentary.updateMany({
            where: {
                status: { in: ["GENERATING", "ASSEMBLING"] },
                updatedAt: { lt: cutoff },
            },
            data: {
                status: "FAILED",
                errorMsg: "Timed out — marked as failed by admin cleanup",
            },
        });

        // Reset stuck gen jobs (QUEUED, PROCESSING)
        const stuckGenJobs = await prisma.genJob.updateMany({
            where: {
                status: { in: ["QUEUED", "PROCESSING"] },
                updatedAt: { lt: cutoff },
            },
            data: {
                status: "FAILED",
                errorMsg: "Timed out — marked as failed by admin cleanup",
            },
        });

        const total =
            stuckVideos.count +
            stuckSegments.count +
            stuckShorts.count +
            stuckDocs.count +
            stuckGenJobs.count;

        return NextResponse.json({
            cleaned: total,
            details: {
                videos: stuckVideos.count,
                segments: stuckSegments.count,
                shorts: stuckShorts.count,
                documentaries: stuckDocs.count,
                genJobs: stuckGenJobs.count,
            },
        });
    } catch (err: any) {
        console.error("[Cleanup] Failed:", err);
        return NextResponse.json(
            { error: err.message || "Cleanup failed" },
            { status: 500 }
        );
    }
}
