import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { planScenes } from "@/lib/documentary/scene-planner";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        console.log(`[API] Re-evaluating stock searches for documentary: ${id}`);

        const doc = await prisma.documentary.findUnique({
            where: { id },
            include: { scenes: true }
        });

        if (!doc) {
            return NextResponse.json({ error: "Documentary not found" }, { status: 404 });
        }

        // Parse story script if present or build from scenes
        let script: any = null;
        if (doc.script) {
            try {
                script = JSON.parse(doc.script);
            } catch (e) {
                // Raw text script fallback
                script = {
                    title: doc.title || "Documentary",
                    segments: doc.scenes.map((s, idx) => ({
                        segmentIndex: idx,
                        timestamp: `0:${idx * 15}`,
                        narration: s.narrationText || "",
                        visualCue: s.title || `Scene ${idx + 1}`
                    }))
                };
            }
        } else if (doc.scenes && doc.scenes.length > 0) {
            script = {
                title: doc.title || "Documentary",
                segments: doc.scenes.map((s, idx) => ({
                    segmentIndex: idx,
                    timestamp: `0:${idx * 15}`,
                    narration: s.narrationText || "",
                    visualCue: s.title || `Scene ${idx + 1}`
                }))
            };
        }

        if (!script || !script.segments || script.segments.length === 0) {
            return NextResponse.json(
                { error: "No valid script found to re-evaluate search queries." },
                { status: 400 }
            );
        }

        // Re-run scene planning with 3-Point Context Extraction
        await planScenes(id, script, doc.subStyle || "cinematic");

        return NextResponse.json({
            success: true,
            message: "Re-evaluated stock search queries using 3-Point Script Context."
        });
    } catch (err: any) {
        console.error("[API] Re-evaluate searches failed:", err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
