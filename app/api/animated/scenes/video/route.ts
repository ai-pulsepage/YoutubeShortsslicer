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

        // Check if we need to auto-generate the character avatar first
        let finalRefImage = refImage;
        let isPendingAvatar = false;

        if (sceneId && !finalRefImage) {
            const scene = await prisma.docScene.findUnique({
                where: { id: sceneId },
                include: { documentary: { include: { assets: true } } }
            });
            if (scene && scene.documentary) {
                activeDocId = scene.documentaryId;
                let searchQueriesMeta: any = {};
                try {
                    searchQueriesMeta = JSON.parse(scene.searchQueries || "{}");
                } catch {}

                const visualShots = searchQueriesMeta.visualShots || [];
                const shot = visualShots.find((s: any) => s.id === shotId);
                
                if (shot && shot.primaryCharacter && shot.primaryCharacter !== "None") {
                    const charAsset = scene.documentary.assets.find(
                        (a: any) => a.label.toLowerCase() === shot.primaryCharacter.toLowerCase()
                    );
                    if (charAsset) {
                        if (charAsset.imagePath) {
                            finalRefImage = charAsset.imagePath;
                        } else {
                            // Automatically trigger ref_image generation first!
                            console.log(`[Scene Video Gen] Missing avatar for character "${charAsset.label}". Queueing avatar job first.`);
                            
                            const avatarJob = await prisma.genJob.create({
                                data: {
                                    documentaryId: activeDocId,
                                    jobType: "ref_image",
                                    prompt: charAsset.prompt || "",
                                    status: "QUEUED",
                                    assetId: charAsset.id,
                                    metadata: { characterId: charAsset.id } as any
                                }
                            });

                            await dispatchJob({
                                jobId: avatarJob.id,
                                documentaryId: activeDocId,
                                type: "ref_image",
                                prompt: charAsset.prompt || "",
                                referenceImages: [],
                                metadata: { characterId: charAsset.id, model: "flux", sourceApp: "Animated Shorts", title: scene.documentary.title || "Kids Story Project" }
                            });

                            // Mark shot as PENDING_AVATAR
                            const updatedShots = visualShots.map((s: any) => {
                                if (s.id === shotId) {
                                    return { ...s, jobStatus: "PENDING_AVATAR" };
                                }
                                return s;
                            });
                            searchQueriesMeta.visualShots = updatedShots;
                            
                            await prisma.docScene.update({
                                where: { id: sceneId },
                                data: { searchQueries: JSON.stringify(searchQueriesMeta) }
                            });

                            isPendingAvatar = true;
                        }
                    }
                }
            }
        }

        if (isPendingAvatar) {
            return NextResponse.json({
                success: true,
                docId: activeDocId,
                pendingAvatar: true,
                message: "Character avatar is missing. Automatically generating avatar first. Video generation will start once ready!"
            });
        }

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
            referenceImages: finalRefImage ? [finalRefImage] : [],
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
