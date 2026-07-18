import { prisma } from "./lib/prisma";

async function main() {
    const projectId = "cmrp3ubbo00000emv8afajesi";
    console.log(`Fetching active project: ${projectId}`);
    const project = await prisma.documentary.findUnique({
        where: { id: projectId },
        include: {
            scenes: {
                orderBy: { sceneIndex: "asc" }
            }
        }
    });

    if (!project) {
        console.error("Project not found!");
        return;
    }

    console.log(`========================================`);
    console.log(`PROJECT ID: ${project.id}`);
    console.log(`TITLE: ${project.title}`);
    console.log(`SCENES COUNT: ${project.scenes.length}`);
    for (const s of project.scenes) {
        let meta: any = {};
        try {
            if (s.searchQueries && s.searchQueries.startsWith("{")) {
                meta = JSON.parse(s.searchQueries);
            }
        } catch {}

        const visualShots = meta.visualShots || [];
        const hasCompletedShot = visualShots.some((sh: any) => sh.visualPath || sh.jobStatus === "COMPLETED");
        if (hasCompletedShot || s.sceneIndex % 3 === 2) {
            console.log(`  - Scene ${s.sceneIndex} (ID: ${s.id}):`);
            console.log(`    narrationText: "${s.narrationText?.substring(0, 80)}..."`);
            console.log(`    sunoAudioKey: ${meta.sunoAudioKey || "(none)"}`);
            console.log(`    visualShots count: ${visualShots.length}`);
            for (const sh of visualShots) {
                console.log(`      * Shot ${sh.id}: Status=${sh.jobStatus}, Path=${sh.visualPath || "(none)"}, StartPath=${sh.startImagePath || "(none)"}`);
            }
        }
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
