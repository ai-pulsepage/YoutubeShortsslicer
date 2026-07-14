import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dispatchJob } from "@/lib/documentary/redis-client";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { sceneId, visualPrompt, docId, refImage, shotId, duration, chainFromPrevious } = await req.json();
    if (!sceneId || !visualPrompt) {
        return NextResponse.json({ error: "sceneId and visualPrompt are required" }, { status: 400 });
    }

    try {
        let activeDocId = docId;

        // Create parent Documentary project reference if not present
        if (!activeDocId) {
            const doc = await prisma.documentary.create({
                data: {
                    userId: session.user.id,
                    title: `Animated Story Scene Generation`,
                    status: "GENERATING",
                    genre: "children",
                }
            });
            activeDocId = doc.id;
        }

        const jobMetadata = {
            sceneId,
            shotId: shotId || undefined,
            duration: duration || 5,
            chainFromPrevious: !!chainFromPrevious
        };

        // Create GenJob record to track progress
        const genJob = await prisma.genJob.create({
            data: {
                documentaryId: activeDocId,
                jobType: "shot_video",
                prompt: visualPrompt,
                status: "QUEUED",
                metadata: jobMetadata as any
            }
        });

        // Dispatch job onto Redis list queue
        await dispatchJob({
            jobId: genJob.id,
            documentaryId: activeDocId,
            type: "shot_video",
            prompt: visualPrompt,
            referenceImages: refImage ? [refImage] : [],
            metadata: jobMetadata
        });

        return NextResponse.json({
            success: true,
            docId: activeDocId,
            jobId: genJob.id
        });

    } catch (err: any) {
        console.error("[Scene Video Gen] Error:", err.message);
        return NextResponse.json({ error: "Failed to dispatch video generation task", details: err.message }, { status: 500 });
    }
}
