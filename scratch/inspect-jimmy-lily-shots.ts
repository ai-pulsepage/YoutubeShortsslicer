import { prisma } from "../lib/prisma";

async function inspectJimmyLilyShots() {
    const docId = "cmrsf7g96000d0eno8z8bumz2";
    console.log(`=== INSPECTING PROJECT ${docId} SCENES & SHOTS ===`);

    const doc = await prisma.documentary.findUnique({
        where: { id: docId },
        include: {
            scenes: {
                orderBy: { sceneIndex: "asc" }
            }
        }
    });

    if (!doc) {
        console.log(`Documentary ${docId} not found.`);
        return;
    }

    for (const scene of doc.scenes) {
        console.log(`\n--- Scene ${scene.sceneIndex + 1} (ID: ${scene.id}) ---`);
        let parsed: any = {};
        try {
            parsed = JSON.parse(scene.searchQueries || "{}");
        } catch (e) {
            console.log("Could not parse searchQueries JSON");
        }

        const visualShots = parsed.visualShots || [];
        console.log(`VisualShots (${visualShots.length}):`);
        for (const s of visualShots) {
            console.log(`  - Shot ID: ${s.id} | JobID: ${s.jobId || "None"} | JobStatus: ${s.jobStatus || "None"} | VisualPath: ${s.visualPath || "None"} | ClipPath: ${s.clipPath || "None"}`);
        }
    }
}

inspectJimmyLilyShots().catch(console.error);
