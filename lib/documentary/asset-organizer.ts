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
                destKey = `animated/avatars/${job.assetId}.${extension}`;
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

        // The GPU worker may still be uploading when this runs. Retry a few
        // times before giving up so a brief race doesn't permanently fail.
        const MAX_ATTEMPTS = 5;
        const RETRY_DELAY_MS = 2000;
        let lastErr: Error | null = null;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                await moveR2Object(rawOutputPath, destKey);
                return destKey; // success
            } catch (e: any) {
                lastErr = e;
                const isNotFound =
                    e.message?.includes("does not exist") ||
                    e.message?.includes("NoSuchKey") ||
                    e.$metadata?.httpStatusCode === 404;
                if (isNotFound && attempt < MAX_ATTEMPTS) {
                    console.warn(`[AssetOrganizer] Source key not found yet (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${RETRY_DELAY_MS}ms…`);
                    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
                } else {
                    throw e; // non-404 error or out of retries
                }
            }
        }
        throw lastErr;
    } catch (err: any) {
        console.error(`[AssetOrganizer] Failed to organize asset for job ${jobId}:`, err.message);
        return rawOutputPath;
    }
}
