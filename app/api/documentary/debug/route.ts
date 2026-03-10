import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Temporary diagnostic/repair endpoint.
 * 
 * GET  /api/documentary/debug — list all documentaries with assets and jobs
 * POST /api/documentary/debug — reset a documentary status or clean up failed jobs
 *   body: { documentaryId, action: "reset-status" | "clean-failed-jobs" }
 */
export async function GET() {
    const docs = await prisma.documentary.findMany({
        select: {
            id: true,
            title: true,
            status: true,
            visualMode: true,
            imageModel: true,
            createdAt: true,
        },
        orderBy: { createdAt: "desc" },
    });

    const results = [];

    for (const d of docs) {
        const assets = await prisma.docAsset.findMany({
            where: { documentaryId: d.id },
            select: { id: true, label: true, type: true, imagePath: true },
        });

        const jobs = await prisma.genJob.findMany({
            where: { documentaryId: d.id },
            select: { id: true, jobType: true, status: true, outputPath: true, assetId: true },
        });

        results.push({
            ...d,
            assets: assets.map(a => ({
                id: a.id,
                label: a.label,
                type: a.type,
                hasImage: !!a.imagePath,
                imagePath: a.imagePath,
            })),
            genJobs: jobs.map(j => ({
                id: j.id,
                jobType: j.jobType,
                status: j.status,
                outputPath: j.outputPath,
                assetId: j.assetId,
            })),
        });
    }

    return NextResponse.json({ documentaries: results });
}

export async function POST(req: NextRequest) {
    const { documentaryId, action, newStatus } = await req.json();

    if (!documentaryId || !action) {
        return NextResponse.json({ error: "documentaryId and action required" }, { status: 400 });
    }

    if (action === "reset-status") {
        const targetStatus = newStatus || "SCENES_PLANNED";
        // Reset to target status, clear errorMsg, and delete all failed/queued GenJobs
        await prisma.genJob.deleteMany({
            where: { documentaryId, status: "FAILED" },
        });
        await prisma.genJob.deleteMany({
            where: { documentaryId, status: "QUEUED" },
        });
        await prisma.documentary.update({
            where: { id: documentaryId },
            data: { status: targetStatus as any, errorMsg: null },
        });
        return NextResponse.json({ success: true, status: targetStatus, message: `Reset to ${targetStatus} and cleaned failed jobs` });
    }

    if (action === "clean-failed-jobs") {
        const deleted = await prisma.genJob.deleteMany({
            where: { documentaryId, status: "FAILED" },
        });
        return NextResponse.json({ success: true, deleted: deleted.count });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
