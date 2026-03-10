/**
 * Admin Storage API
 * 
 * GET  /api/admin/storage — R2 storage stats (total objects, size, breakdown)
 * POST /api/admin/storage — Clean orphaned R2 objects
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getR2StorageStats, listR2Objects, deleteMultipleFromR2 } from "@/lib/storage";

// Restrict to admin users
async function isAdmin() {
    const session = await auth();
    return session?.user?.id ? true : false; // TODO: add proper admin check
}

export async function GET() {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const stats = await getR2StorageStats();
        return NextResponse.json(stats);
    } catch (err) {
        console.error("[Admin Storage] Error fetching stats:", err);
        return NextResponse.json({ error: "Failed to fetch storage stats" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "clean-orphans") {
        try {
            // List all R2 objects under documentaries/
            const r2Objects = await listR2Objects("documentaries/");
            const r2Keys = r2Objects.map(o => o.key);

            // Get all referenced paths from DB
            const [assets, jobs, shots] = await Promise.all([
                prisma.docAsset.findMany({
                    where: { imagePath: { not: null } },
                    select: { imagePath: true },
                }),
                prisma.genJob.findMany({
                    where: { outputPath: { not: null } },
                    select: { outputPath: true },
                }),
                prisma.docShot.findMany({
                    where: { OR: [{ clipPath: { not: null } }, { lastFramePath: { not: null } }] },
                    select: { clipPath: true, lastFramePath: true },
                }),
            ]);

            const dbPaths = new Set<string>();
            assets.forEach(a => { if (a.imagePath) dbPaths.add(a.imagePath); });
            jobs.forEach(j => { if (j.outputPath) dbPaths.add(j.outputPath); });
            shots.forEach(s => {
                if (s.clipPath) dbPaths.add(s.clipPath);
                if (s.lastFramePath) dbPaths.add(s.lastFramePath);
            });

            // Find orphans: R2 keys not in DB
            const orphans = r2Keys.filter(key => !dbPaths.has(key));

            if (orphans.length === 0) {
                return NextResponse.json({
                    message: "No orphaned files found",
                    r2Total: r2Keys.length,
                    dbTotal: dbPaths.size,
                    orphans: 0,
                });
            }

            const deleted = await deleteMultipleFromR2(orphans);

            return NextResponse.json({
                message: `Cleaned ${deleted} orphaned R2 objects`,
                r2Total: r2Keys.length,
                dbTotal: dbPaths.size,
                orphans: orphans.length,
                deleted,
                orphanKeys: orphans.slice(0, 20), // Show first 20 for debugging
            });
        } catch (err) {
            console.error("[Admin Storage] Orphan cleanup failed:", err);
            return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
        }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
