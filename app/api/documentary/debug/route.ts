import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Temporary diagnostic endpoint to check documentary + asset state.
 * DELETE THIS after debugging.
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
