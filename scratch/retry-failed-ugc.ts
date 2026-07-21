import { prisma } from "../lib/prisma";
import { getQueue } from "../lib/queue";

async function main() {
    console.log("Searching for FAILED UGC jobs to recover...");
    const failedJobs = await prisma.uGCJob.findMany({
        where: { status: "FAILED" },
        include: { avatar: true, product: true }
    });

    console.log(`Found ${failedJobs.length} failed jobs.`);

    if (failedJobs.length > 0) {
        const ugcQueue = getQueue("ugc-generation");
        for (const job of failedJobs) {
            console.log(`Recovering job ${job.id} (${job.avatar?.name || 'Avatar'} - ${job.product?.name || 'Product'})...`);
            await prisma.uGCJob.update({
                where: { id: job.id },
                data: { status: "PENDING", errorMsg: null }
            });
            await ugcQueue.add("ugc-job", { jobId: job.id });
        }
        console.log(`Successfully re-queued all ${failedJobs.length} failed jobs!`);
    } else {
        console.log("No failed jobs found in DB.");
    }
}

main().catch(console.error);
