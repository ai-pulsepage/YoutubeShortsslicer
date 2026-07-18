import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dispatchJob } from "@/lib/documentary/redis-client";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { docId, characterId, prompt } = await req.json();
    if (!docId || !characterId || !prompt) {
        return NextResponse.json({ error: "docId, characterId and prompt are required" }, { status: 400 });
    }

    try {
        // Ensure character asset exists in database
        const character = await prisma.docAsset.findUnique({
            where: { id: characterId }
        });

        if (!character) {
            return NextResponse.json({ error: "Character profile not found" }, { status: 404 });
        }

        // Check if there is already an active (QUEUED or PROCESSING) ref_image job for this asset
        const activeJob = await prisma.genJob.findFirst({
            where: {
                assetId: characterId,
                jobType: "ref_image",
                status: { in: ["QUEUED", "PROCESSING"] }
            }
        });

        if (activeJob) {
            console.log(`[Avatar API] Active job ${activeJob.id} already exists for character ${characterId}. Reusing.`);
            return NextResponse.json({
                success: true,
                jobId: activeJob.id,
                message: "Avatar generation is already in progress."
            });
        }

        // Create a GenJob to track image generation
        const job = await prisma.genJob.create({
            data: {
                documentaryId: docId,
                jobType: "ref_image",
                prompt: prompt,
                status: "QUEUED",
                assetId: characterId,
                metadata: { 
                    characterId,
                    r2Key: `animated/avatars/${characterId}.webp`
                } as any
            }
        });

        // Dispatch to GPU worker queue
        await dispatchJob({
            jobId: job.id,
            documentaryId: docId,
            type: "ref_image",
            prompt: prompt,
            referenceImages: [],
            metadata: { 
                characterId, 
                model: "flux",
                r2Key: `animated/avatars/${characterId}.webp`
            }
        });

        return NextResponse.json({
            success: true,
            jobId: job.id
        });

    } catch (err: any) {
        console.error("[Character Avatar Gen] Error:", err.message);
        return NextResponse.json({ error: "Failed to queue avatar generation", details: err.message }, { status: 500 });
    }
}
