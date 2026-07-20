import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getQueue } from "@/lib/queue";

export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await req.json().catch(() => ({}));
        const { jobId, retryAllFailed = true } = body;

        let jobsToRetry: any[] = [];

        if (jobId) {
            const job = await prisma.uGCJob.findFirst({
                where: { id: jobId, userId: session.user.id }
            });
            if (job) jobsToRetry.push(job);
        } else if (retryAllFailed) {
            jobsToRetry = await prisma.uGCJob.findMany({
                where: { userId: session.user.id, status: "FAILED" }
            });
        }

        if (jobsToRetry.length === 0) {
            return NextResponse.json({ message: "No failed jobs to retry", retriedCount: 0 });
        }

        const ugcQueue = getQueue("ugc-generation");
        const retriedIds: string[] = [];

        for (const j of jobsToRetry) {
            await prisma.uGCJob.update({
                where: { id: j.id },
                data: {
                    status: "PENDING",
                    errorMsg: null
                }
            });

            await ugcQueue.add("ugc-job", { jobId: j.id });
            retriedIds.push(j.id);
        }

        console.log(`[UGC Retry Route] Re-queued ${retriedIds.length} failed jobs:`, retriedIds);
        return NextResponse.json({
            message: `Successfully re-queued ${retriedIds.length} jobs`,
            retriedCount: retriedIds.length,
            retriedIds
        });
    } catch (err: any) {
        console.error("[UGC Retry Route] Error retrying jobs:", err.message);
        return NextResponse.json({ error: err.message || "Failed to retry jobs" }, { status: 500 });
    }
}
