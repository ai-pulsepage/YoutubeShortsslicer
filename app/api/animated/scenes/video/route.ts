import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dispatchJob } from "@/lib/documentary/redis-client";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { sceneId, visualPrompt, docId, refImage, shotId, duration, chainFromPrevious, videoModel } = await req.json();
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

        const selectedVideoModel = videoModel || "wan2.3";
        const jobMetadata = {
            sceneId,
            shotId: shotId || undefined,
            duration: duration || 5,
            chainFromPrevious: !!chainFromPrevious,
            sourceApp: "Animated Shorts",
            model: selectedVideoModel,
            hasNativeAudio: selectedVideoModel === "ltx2.3" || selectedVideoModel.includes("a2v"),
            r2Key: `animated/projects/${activeDocId}/scenes/${sceneId}/shots/shot_${shotId || Date.now()}.mp4`,
            r2KeyLastFrame: `animated/projects/${activeDocId}/scenes/${sceneId}/shots/shot_${shotId || Date.now()}_last_frame.png`
        };

        let finalRefImage = null;
        let isGeneratingImage = false;
        let isPendingPrevious = false;

        if (sceneId) {
            const scene = await prisma.docScene.findUnique({
                where: { id: sceneId },
                include: { documentary: { include: { assets: true, scenes: { orderBy: { sceneIndex: "asc" } } } } }
            });
            if (scene && scene.documentary) {
                activeDocId = scene.documentaryId;
                let searchQueriesMeta: any = {};
                try {
                    searchQueriesMeta = JSON.parse(scene.searchQueries || "{}");
                } catch {}

                const visualShots = searchQueriesMeta.visualShots || [];
                const shotIdx = visualShots.findIndex((s: any) => s.id === shotId);
                const shot = shotIdx !== -1 ? visualShots[shotIdx] : null;

                if (chainFromPrevious && shotIdx !== -1) {
                    const prevShot = getPreviousShot(scene.documentary, scene, shotIdx);
                    if (prevShot && (prevShot.lastFramePath || prevShot.visualPath)) {
                        finalRefImage = prevShot.lastFramePath || prevShot.visualPath;
                        console.log(`[Scene Video Gen] Chaining shot ${shotId} from previous shot reference: ${finalRefImage}`);
                    } else {
                        isPendingPrevious = true;
                    }
                } else if (shot) {
                    if (shot.startImagePath) {
                        finalRefImage = shot.startImagePath;
                    } else {
                        // Automatically trigger start frame image generation first!
                        console.log(`[Scene Video Gen] Missing start image for shot "${shotId}". Launching FLUX composition job.`);

                        let characterRefImage: string | null = null;
                        if (shot.primaryCharacter && shot.primaryCharacter !== "None" && shot.primaryCharacter !== "Narrator") {
                            const charAsset = scene.documentary.assets.find(
                                (a: any) => a.type === "CHARACTER" && a.label === shot.primaryCharacter
                            );
                            if (charAsset && charAsset.imagePath) {
                                characterRefImage = charAsset.imagePath;
                            }
                        }

                        const avatarJob = await prisma.genJob.create({
                            data: {
                                documentaryId: activeDocId,
                                jobType: "ref_image",
                                prompt: shot.imagePrompt || shot.visualPrompt || visualPrompt,
                                status: "QUEUED",
                                metadata: {
                                    shotId: shot.id,
                                    sceneId: scene.id,
                                    jobPurpose: "shot_start_image",
                                    sourceApp: "Animated Shorts",
                                    model: "flux",
                                    title: scene.documentary.title || "Kids Story Project",
                                    r2Key: `animated/projects/${activeDocId}/scenes/${scene.id}/shots/shot_${shot.id}_start.webp`
                                } as any
                            }
                        });

                        await dispatchJob({
                            jobId: avatarJob.id,
                            documentaryId: activeDocId,
                            type: "ref_image",
                            prompt: shot.imagePrompt || shot.visualPrompt || visualPrompt,
                            referenceImages: characterRefImage ? [characterRefImage] : [],
                            metadata: {
                                shotId: shot.id,
                                sceneId: scene.id,
                                jobPurpose: "shot_start_image",
                                sourceApp: "Animated Shorts",
                                model: "flux",
                                title: scene.documentary.title || "Kids Story Project",
                                r2Key: `animated/projects/${activeDocId}/scenes/${scene.id}/shots/shot_${shot.id}_start.webp`
                            }
                        });

                        // Mark shot as GENERATING_IMAGE
                        const updatedShots = visualShots.map((s: any) => {
                            if (s.id === shotId) {
                                return { 
                                    ...s, 
                                    startImageJobId: avatarJob.id,
                                    startImageJobStatus: "QUEUED",
                                    jobStatus: "GENERATING_IMAGE" 
                                };
                            }
                            return s;
                        });
                        searchQueriesMeta.visualShots = updatedShots;
                        
                        await prisma.docScene.update({
                            where: { id: sceneId },
                            data: { searchQueries: JSON.stringify(searchQueriesMeta) }
                        });

                        isGeneratingImage = true;
                    }
                }
            }
        }

        if (isPendingPrevious) {
            return NextResponse.json({
                error: "PENDING_PREVIOUS",
                details: "This shot is chained from the previous shot. You must generate the previous shot first to create a reference frame!"
            }, { status: 400 });
        }

        if (isGeneratingImage) {
            return NextResponse.json({
                success: true,
                docId: activeDocId,
                generatingImage: true,
                message: "Starting scene image is missing. Automatically generating starting canvas first using FLUX. Video animation will start automatically when ready!"
            });
        }

        // Check for duplicate video jobs in the same project that are QUEUED or PROCESSING
        const activeVideoJobs = await prisma.genJob.findMany({
            where: {
                documentaryId: activeDocId,
                jobType: "shot_video",
                status: { in: ["QUEUED", "PROCESSING"] }
            }
        });
        const duplicateJob = activeVideoJobs.find(j => {
            const meta = j.metadata as any;
            return meta && meta.sceneId === sceneId && meta.shotId === shotId;
        });

        if (duplicateJob) {
            console.log(`[Scene Video Gen] Active video job ${duplicateJob.id} already exists for scene ${sceneId} shot ${shotId}. Reusing.`);
            return NextResponse.json({
                success: true,
                docId: activeDocId,
                jobId: duplicateJob.id,
                message: "Video generation for this shot is already in progress."
            });
        }

        // Resolve combined cinematic prompt
        let activePrompt = visualPrompt;
        if (sceneId && shotId) {
            const sceneObj = await prisma.docScene.findUnique({ where: { id: sceneId } });
            if (sceneObj) {
                try {
                    const parsed = JSON.parse(sceneObj.searchQueries || "{}");
                    const targetShot = (parsed.visualShots || []).find((s: any) => s.id === shotId);
                    if (targetShot) {
                        const basePrompt = targetShot.visualPrompt || targetShot.imagePrompt || visualPrompt;
                        const motion = targetShot.motionPrompt || "";
                        if (motion) {
                            activePrompt = `${basePrompt}. Motion: ${motion}`;
                        } else {
                            activePrompt = basePrompt;
                        }
                        // Clean up repetitive style tags to prevent prompt bloat
                        activePrompt = activePrompt
                            .replace(/(in Pixar 3D style,?\s*){2,}/gi, "in Pixar 3D style, ")
                            .replace(/(plain neutral studio background,?\s*){2,}/gi, "plain neutral studio background, ")
                            .trim();
                    }
                } catch {}
            }
        }

        // Create GenJob record to track progress
        const genJob = await prisma.genJob.create({
            data: {
                documentaryId: activeDocId,
                jobType: "shot_video",
                prompt: activePrompt,
                status: "QUEUED",
                metadata: jobMetadata as any
            }
        });

        // Dispatch job onto Redis list queue
        await dispatchJob({
            jobId: genJob.id,
            documentaryId: activeDocId,
            type: "shot_video",
            prompt: activePrompt,
            referenceImages: finalRefImage ? [finalRefImage] : [],
            metadata: jobMetadata
        });

        // Save jobId and status inside the scene visualShots array
        if (sceneId && shotId) {
            const sceneObj = await prisma.docScene.findUnique({ where: { id: sceneId } });
            if (sceneObj) {
                try {
                    const parsed = JSON.parse(sceneObj.searchQueries || "{}");
                    parsed.visualShots = (parsed.visualShots || []).map((s: any) => {
                        if (s.id === shotId) {
                            return { ...s, jobId: genJob.id, jobStatus: "QUEUED" };
                        }
                        return s;
                    });
                    await prisma.docScene.update({
                        where: { id: sceneId },
                        data: { searchQueries: JSON.stringify(parsed) }
                    });
                } catch {}
            }
        }

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

function getPreviousShot(project: any, currentScene: any, currentShotIndex: number) {
    if (currentShotIndex > 0) {
        const parsed = JSON.parse(currentScene.searchQueries || "{}");
        const shots = parsed.visualShots || [];
        return shots[currentShotIndex - 1];
    }
    
    // Find the previous scene
    const prevScene = project.scenes.find((s: any) => s.sceneIndex === currentScene.sceneIndex - 1);
    if (prevScene) {
        const parsed = JSON.parse(prevScene.searchQueries || "{}");
        const shots = parsed.visualShots || [];
        if (shots.length > 0) {
            return shots[shots.length - 1];
        }
    }
    return null;
}
