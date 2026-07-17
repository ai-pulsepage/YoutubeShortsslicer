import { prisma } from "./lib/prisma";

async function main() {
    console.log("Fetching latest story projects...");
    const projects = await prisma.documentary.findMany({
        orderBy: { updatedAt: "desc" },
        take: 3,
        include: {
            scenes: {
                orderBy: { sceneIndex: "asc" }
            }
        }
    });

    for (const p of projects) {
        console.log(`\n========================================`);
        console.log(`PROJECT ID: ${p.id}`);
        console.log(`TITLE: ${p.title}`);
        console.log(`UPDATED: ${p.updatedAt}`);
        console.log(`SCENES COUNT: ${p.scenes.length}`);
        for (const s of p.scenes) {
            console.log(`  - Scene ${s.sceneIndex} (ID: ${s.id}, Type: ${s.narrationText ? "text" : "empty"}):`);
            console.log(`    narrationText: "${s.narrationText?.substring(0, 60)}..."`);
            console.log(`    metadata: ${s.searchQueries}`);
        }
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
