/**
 * Generation Jobs API
 * 
 * GET /api/documentary/jobs  — List all jobs (filter by status, documentary)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const documentaryId = searchParams.get("documentaryId");
    const status = searchParams.get("status");
    const jobType = searchParams.get("jobType");

    const where: Record<string, unknown> = {
        documentary: { userId: session.user.id },
    };

    if (documentaryId) where.documentaryId = documentaryId;
    if (status) where.status = status;
    if (jobType) where.jobType = jobType;

    const jobs = await prisma.genJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
    });

    // Calculate summary stats
    const stats = {
        total: jobs.length,
        queued: jobs.filter((j) => j.status === "QUEUED").length,
        processing: jobs.filter((j) => j.status === "PROCESSING").length,
        completed: jobs.filter((j) => j.status === "COMPLETED").length,
        failed: jobs.filter((j) => j.status === "FAILED").length,
    };

    return NextResponse.json({ jobs, stats });
}
