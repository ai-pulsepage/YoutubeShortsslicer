import { prisma } from "../prisma";
import { moveR2Object } from "../storage";

export async function organizeCompletedJobAsset(jobId: string, rawOutputPath: string): Promise<string> {
    if (!rawOutputPath) return rawOutputPath;
    
    // Avoid re-processing if the path is already organized
    if (
        rawOutputPath.startsWith("ugc/") || 
        rawOutputPath.startsWith("animated/") || 
        rawOutputPath.startsWith("documentary/")
    ) {
        return rawOutputPath;
    }

    try {
        const job = await prisma.genJob.findUnique({
            where: { id: jobId },
            include: { documentary: true }
        });
        if (!job) return rawOutputPath;

        const meta = job.metadata as any;
        const extension = rawOutputPath.split(".").pop() || (job.jobType === "shot_video" ? "mp4" : "png");
        let destKey = rawOutputPath;

        // 1. UGC Avatars
        if (meta && meta.ugcAvatarId) {
            destKey = `ugc/avatars/${meta.ugcAvatarId}/portrait.${extension}`;
        }
        // 2. Animated Shorts (Kids Story Studio)
        else if (job.documentary && job.documentary.genre === "children") {
            if (job.jobType === "ref_image" && job.assetId) {
                destKey = `animated/projects/${job.documentaryId}/characters/${job.assetId}.${extension}`;
            } else if (job.jobType === "shot_video") {
                const sceneId = meta?.sceneId || "unknown_scene";
                const shotId = meta?.shotId || job.shotId || "unknown_shot";
                destKey = `animated/projects/${job.documentaryId}/clips/scene_${sceneId}_shot_${shotId}.${extension}`;
            }
        }
        // 3. Documentary Factory
        else {
            if (job.jobType === "ref_image" && job.assetId) {
                destKey = `documentary/projects/${job.documentaryId}/assets/${job.assetId}.${extension}`;
            } else if (job.jobType === "shot_video" && job.shotId) {
                destKey = `documentary/projects/${job.documentaryId}/clips/shot_${job.shotId}.${extension}`;
            }
        }

        console.log(`[AssetOrganizer] Moving R2 object: ${rawOutputPath} -> ${destKey}`);
        await moveR2Object(rawOutputPath, destKey);
        return destKey;
    } catch (err: any) {
        console.error(`[AssetOrganizer] Failed to organize asset for job ${jobId}:`, err.message);
        return rawOutputPath;
    }
}
