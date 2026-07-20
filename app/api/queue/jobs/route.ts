import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRedis, CHANNELS } from "@/lib/documentary/redis-client";
import IORedis from "ioredis";
import { Queue } from "bullmq";

const BULL_QUEUES = ["video-download", "transcription", "segmentation", "render", "ugc-generation"];

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const redis = getRedis();
    const listJobs: any[] = [];

    try {
        // 1. Fetch RunPod List Jobs (documentary_jobs)
        const rawItems = await redis.lrange(CHANNELS.DOCUMENTARY_JOBS, 0, -1);
        for (const item of rawItems) {
            try {
                const parsed = JSON.parse(item);
                listJobs.push({
                    id: parsed.jobId,
                    documentaryId: parsed.documentaryId,
                    type: parsed.type, // "ref_image" | "shot_video"
                    prompt: parsed.prompt,
                    queueName: "documentary_jobs",
                    sourceApp: parsed.metadata?.sourceApp || "Animated Shorts",
                    projectTitle: parsed.metadata?.title || "Kids Story Project",
                    status: "QUEUED",
                    rawString: item
                });
            } catch (e) {
                // Ignore parsing errors for corrupted list items
            }
        }

        // 2. Fetch BullMQ queue jobs
        const bullRedis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
            maxRetriesPerRequest: null,
        });

        try {
            for (const qName of BULL_QUEUES) {
                const queue = new Queue(qName, { connection: bullRedis as any });
                const jobs = await queue.getJobs(["waiting", "active", "delayed"]);
                
                for (const job of jobs) {
                    listJobs.push({
                        id: job.id || "",
                        type: job.name,
                        prompt: job.data?.prompt || job.data?.videoUrl || "N/A",
                        queueName: qName,
                        sourceApp: qName === "render" ? "Render Engine / UGC" : "Video Slicer",
                        projectTitle: job.data?.title || job.data?.product?.name || "Ingested Short Job",
                        status: await job.getState()
                    });
                }
                await queue.close();
            }
        } finally {
            await bullRedis.quit();
        }

        // 3. Fetch active GenJobs from database to track jobs that have been popped from Redis but are still rendering
        try {
            const activeDbJobs = await prisma.genJob.findMany({
                where: {
                    status: { in: ["QUEUED", "PROCESSING"] }
                },
                orderBy: { createdAt: "desc" }
            });
            
            for (const dbJob of activeDbJobs) {
                // Avoid duplicating jobs already listed directly from Redis
                if (listJobs.some(j => j.id === dbJob.id)) continue;
                
                const meta = dbJob.metadata as any;
                listJobs.push({
                    id: dbJob.id,
                    documentaryId: dbJob.documentaryId,
                    type: dbJob.jobType,
                    prompt: dbJob.prompt || "N/A",
                    queueName: "documentary_jobs",
                    sourceApp: meta?.sourceApp || "Animated Shorts",
                    projectTitle: meta?.title || "Kids Story Project",
                    status: dbJob.status, // "QUEUED" or "PROCESSING"
                });
            }

            // Query active UGC jobs from DB
            const activeUgcJobs = await prisma.uGCJob.findMany({
                where: {
                    status: { in: ["PENDING", "GENERATING_VIDEO", "COMPOSITING"] }
                },
                include: { avatar: true, product: true },
                orderBy: { createdAt: "desc" }
            });

            for (const ugcJob of activeUgcJobs) {
                if (listJobs.some(j => j.id === ugcJob.id)) continue;
                listJobs.push({
                    id: ugcJob.id,
                    type: "ugc_ad_video",
                    prompt: ugcJob.script ? `Ad script: "${ugcJob.script.slice(0, 80)}..."` : `Ad for ${ugcJob.product?.name || "Product"}`,
                    queueName: "ugc-generation",
                    sourceApp: "UGC Studio",
                    projectTitle: `Ad (${ugcJob.avatar?.name || "Avatar"} - ${ugcJob.product?.name || "Product"})`,
                    status: ugcJob.status,
                });
            }
        } catch (dbErr: any) {
            console.warn("[Queue Jobs GET] db fallback check failed:", dbErr.message);
        }

        return NextResponse.json({ success: true, jobs: listJobs });
    } catch (err: any) {
        console.error("[Queue Jobs GET] failed:", err.message);
        return NextResponse.json({ error: "Failed to query queues", details: err.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { jobId, queueName } = await req.json();
    if (!jobId || !queueName) {
        return NextResponse.json({ error: "jobId and queueName are required" }, { status: 400 });
    }

    try {
        const redis = getRedis();

        // Mode A: RunPod Queue (documentary_jobs list)
        if (queueName === "documentary_jobs") {
            const rawItems = await redis.lrange(CHANNELS.DOCUMENTARY_JOBS, 0, -1);
            let matchedRawItem: string | null = null;
            
            for (const item of rawItems) {
                try {
                    const parsed = JSON.parse(item);
                    if (parsed.jobId === jobId) {
                        matchedRawItem = item;
                        break;
                    }
                } catch {}
            }

            if (matchedRawItem) {
                // Remove 1 occurrence of the exact JSON string
                await redis.lrem(CHANNELS.DOCUMENTARY_JOBS, 1, matchedRawItem);
            }

            // Sync PostgreSQL state: Mark GenJob as failed
            const genJob = await prisma.genJob.findUnique({ where: { id: jobId } });
            if (genJob) {
                await prisma.genJob.update({
                    where: { id: jobId },
                    data: { status: "FAILED", errorMsg: "Job cancelled by user" }
                });



                // Reset scene storyboard video queue state
                const scene = await prisma.docScene.findFirst({
                    where: {
                        searchQueries: { contains: jobId }
                    }
                });
                if (scene && scene.searchQueries) {
                    try {
                        const meta = JSON.parse(scene.searchQueries);
                        if (meta.visualShots) {
                            meta.visualShots = meta.visualShots.map((shot: any) => {
                                if (shot.jobId === jobId) {
                                    return { ...shot, jobId: null, jobStatus: "IDLE" };
                                }
                                return shot;
                            });
                            await prisma.docScene.update({
                                where: { id: scene.id },
                                data: {
                                    searchQueries: JSON.stringify(meta)
                                }
                            });
                        }
                    } catch (e) {
                        console.error("[Queue Delete] JSON parse searchQueries failed:", e);
                    }
                }
            }
        } else {
            // Mode B: BullMQ Jobs
            const bullRedis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
                maxRetriesPerRequest: null,
            });

            try {
                const queue = new Queue(queueName, { connection: bullRedis as any });
                const job = await queue.getJob(jobId);
                if (job) {
                    await job.remove();
                }
                await queue.close();
            } finally {
                await bullRedis.quit();
            }
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("[Queue Jobs DELETE] failed:", err.message);
        return NextResponse.json({ error: "Failed to cancel job", details: err.message }, { status: 500 });
    }
}
