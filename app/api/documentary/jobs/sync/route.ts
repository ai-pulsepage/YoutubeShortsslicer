/**
 * Job Results Sync API
 * 
 * POST /api/documentary/jobs/sync
 * 
 * Drains the Redis results queue and updates GenJob + DocAsset records.
 * Called automatically by the frontend during auto-refresh.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRedis, CHANNELS } from "@/lib/documentary/redis-client";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const redis = getRedis();
    let synced = 0;
    let failed = 0;

    // Drain up to 50 results from the queue per call
    for (let i = 0; i < 50; i++) {
        const result = await redis.rpop(CHANNELS.DOCUMENTARY_RESULTS);
        if (!result) break; // Queue empty

        try {
            const data = JSON.parse(result);
            const jobId = data.jobId;
            const status = data.status === "completed" ? "COMPLETED" : "FAILED";
            const outputPath = data.outputPath || null;
            const errorMsg = data.error || null;

            // Update GenJob in DB
            const job = await prisma.genJob.update({
                where: { id: jobId },
                data: {
                    status,
                    outputPath,
                    errorMsg,
                },
            });

            // If image job completed, update the DocAsset with the image path
            if (status === "COMPLETED" && outputPath && job.assetId) {
                await prisma.docAsset.update({
                    where: { id: job.assetId },
                    data: { imagePath: outputPath },
                });
            }

            synced++;
        } catch (err) {
            console.error("[Sync] Error processing result:", err);
            failed++;
        }
    }

    // Check if all image jobs for any documentary are done
    if (synced > 0) {
        // Find documentaries with all image jobs completed
        const inProgress = await prisma.documentary.findMany({
            where: {
                userId: session.user.id,
                status: "GENERATING",
            },
            include: {
                genJobs: {
                    where: { jobType: "ref_image" },
                },
            },
        });

        for (const doc of inProgress) {
            const allDone = doc.genJobs.length > 0 && doc.genJobs.every(
                (j) => j.status === "COMPLETED" || j.status === "FAILED"
            );
            if (allDone) {
                const anyFailed = doc.genJobs.some((j) => j.status === "FAILED");
                await prisma.documentary.update({
                    where: { id: doc.id },
                    data: {
                        status: anyFailed ? "FAILED" : "ASSETS_READY",
                        errorMsg: anyFailed ? `${doc.genJobs.filter(j => j.status === "FAILED").length} asset jobs failed` : null,
                    },
                });
            }
        }
    }

    return NextResponse.json({ synced, failed });
}
