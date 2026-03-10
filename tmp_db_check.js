const { PrismaClient } = require("@prisma/client");

async function main() {
    const prisma = new PrismaClient();
    
    // 1. List all documentaries
    const docs = await prisma.documentary.findMany({
        select: { 
            id: true, 
            title: true, 
            status: true, 
            visualMode: true, 
            imageModel: true,
            createdAt: true,
        },
        orderBy: { createdAt: "desc" },
    });
    
    console.log("\n=== DOCUMENTARIES ===");
    for (const d of docs) {
        console.log(`  ${d.id} | ${d.title} | status=${d.status} | visualMode=${d.visualMode} | imageModel=${d.imageModel}`);
    }
    
    // 2. For each doc, check assets and GenJobs
    for (const d of docs) {
        const assets = await prisma.docAsset.findMany({
            where: { documentaryId: d.id },
            select: { id: true, label: true, type: true, imagePath: true },
        });
        
        const jobs = await prisma.genJob.findMany({
            where: { documentaryId: d.id },
            select: { id: true, jobType: true, status: true, outputPath: true, assetId: true, prompt: true },
        });
        
        console.log(`\n--- ${d.title} (${d.id}) ---`);
        console.log(`  Assets: ${assets.length}`);
        for (const a of assets) {
            console.log(`    ${a.id} | ${a.label} [${a.type}] | imagePath=${a.imagePath || "NULL"}`);
        }
        console.log(`  GenJobs: ${jobs.length}`);
        for (const j of jobs) {
            console.log(`    ${j.id} | ${j.jobType} | status=${j.status} | output=${j.outputPath || "NULL"} | asset=${j.assetId || "NULL"}`);
        }
    }
    
    await prisma.$disconnect();
}

main().catch(console.error);
