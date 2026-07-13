import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    try {
        console.log("=== DATABASE CLEAN-UP STARTING ===");
        
        // Delete GenJobs (background tasks)
        const jobs = await prisma.genJob.deleteMany({});
        console.log(`[CleanUp] Deleted ${jobs.count} GenJob records`);

        // Delete DocScenes (timeline storyboard scenes)
        const scenes = await prisma.docScene.deleteMany({});
        console.log(`[CleanUp] Deleted ${scenes.count} DocScene records`);

        // Delete DocAssets (project character listings)
        const assets = await prisma.docAsset.deleteMany({});
        console.log(`[CleanUp] Deleted ${assets.count} DocAsset records`);

        // Delete Documentaries (parent projects)
        const docs = await prisma.documentary.deleteMany({});
        console.log(`[CleanUp] Deleted ${docs.count} Documentary projects`);

        return NextResponse.json({
            success: true,
            message: "Database tables cleared successfully",
            deletedCount: {
                genJobs: jobs.count,
                docScenes: scenes.count,
                docAssets: assets.count,
                documentaries: docs.count
            }
        });
    } catch (err: any) {
        console.error("[CleanUp] Failed:", err.message);
        return NextResponse.json({ error: "Database clean-up failed", details: err.message }, { status: 500 });
    }
}
