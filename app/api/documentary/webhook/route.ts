/**
 * GPU Worker Webhook
 *
 * POST /api/documentary/webhook
 *
 * Called by the RunPod GPU worker when a job completes or fails.
 * Updates GenJob, DocAsset/DocShot, and Documentary status.
 *
 * Secured via a shared secret (WORKER_WEBHOOK_SECRET env var).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface WorkerResult {
    jobId: string;
    status: "completed" | "failed";
    outputPath?: string;
    lastFramePath?: string;
    error?: string;
}

export async function POST(req: NextRequest) {
    // Verify webhook secret
    const secret = req.headers.get("x-webhook-secret");
    const expectedSecret = process.env.WORKER_WEBHOOK_SECRET || "documentary-worker-secret";
    if (secret !== expectedSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result: WorkerResult = await req.json();
    const { jobId, status, outputPath, lastFramePath, error } = result;

    console.log(`[Webhook] Job ${jobId}: ${status}${outputPath ? ` → ${outputPath}` : ""}`);

    // Find the job
    const job = await prisma.genJob.findUnique({ where: { id: jobId } });
    if (!job) {
        console.warn(`[Webhook] Job ${jobId} not found in DB`);
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (status === "completed" && outputPath) {
        // Update job
        await prisma.genJob.update({
            where: { id: jobId },
            data: { status: "COMPLETED", outputPath },
        });

        // Update asset (ref images)
        if (job.assetId && job.jobType === "ref_image") {
            await prisma.docAsset.update({
                where: { id: job.assetId },
                data: { imagePath: outputPath },
            });
            console.log(`[Webhook]   Asset ${job.assetId} updated`);
        }

        // Update shot (video clips)
        if (job.shotId && job.jobType === "shot_video") {
            const updateData: Record<string, string> = { clipPath: outputPath };
            if (lastFramePath) updateData.lastFramePath = lastFramePath;

            await prisma.docShot.update({
                where: { id: job.shotId },
                data: updateData,
            });
            console.log(`[Webhook]   Shot ${job.shotId} clipPath set`);
        }

        // Check documentary completion
        await checkDocumentaryCompletion(job.documentaryId);

    } else if (status === "failed") {
        await prisma.genJob.update({
            where: { id: jobId },
            data: {
                status: "FAILED",
                errorMsg: error || "Unknown GPU worker error",
            },
        });
        console.error(`[Webhook]   Job ${jobId} FAILED: ${error}`);
    }

    return NextResponse.json({ ok: true });
}

async function checkDocumentaryCompletion(documentaryId: string) {
    const jobs = await prisma.genJob.findMany({
        where: { documentaryId },
        select: { status: true, jobType: true },
    });

    const allDone = jobs.every((j) => j.status === "COMPLETED" || j.status === "FAILED");
    if (!allDone) return;

    const videoJobs = jobs.filter((j) => j.jobType === "shot_video");
    const videosDone = videoJobs.every((j) => j.status === "COMPLETED");
    const refImageJobs = jobs.filter((j) => j.jobType === "ref_image");
    const refImagesDone = refImageJobs.every((j) => j.status === "COMPLETED");

    const doc = await prisma.documentary.findUnique({
        where: { id: documentaryId },
        select: { status: true },
    });
    if (!doc) return;

    let newStatus: string | null = null;

    if (doc.status === "GENERATING" && refImageJobs.length > 0 && refImagesDone && videoJobs.length === 0) {
        newStatus = "ASSETS_READY";
    } else if (doc.status === "GENERATING" && videoJobs.length > 0 && videosDone) {
        newStatus = "ASSETS_READY";
    }

    if (newStatus) {
        await prisma.documentary.update({
            where: { id: documentaryId },
            data: { status: newStatus as any },
        });
        console.log(`[Webhook] Documentary ${documentaryId} → ${newStatus}`);
    }
}
