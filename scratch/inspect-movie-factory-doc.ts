import { prisma } from "../lib/prisma";

async function inspectDoc() {
    const docId = "cmrsf6d6f000c0enozxom968p";
    console.log(`=== INSPECTING MOVIE FACTORY PROJECT: ${docId} ===\n`);

    const doc = await prisma.documentary.findUnique({
        where: { id: docId },
        include: {
            assets: true,
            scenes: {
                orderBy: { sceneIndex: "asc" },
                include: { shots: true }
            }
        }
    });

    if (!doc) {
        console.log(`Documentary with ID ${docId} not found.`);
        return;
    }

    console.log(`Title: ${doc.title}`);
    console.log(`Genre: ${doc.genre}`);
    console.log(`SubStyle: ${doc.subStyle}`);
    console.log(`Status: ${doc.status}`);
    console.log(`Created At: ${doc.createdAt}`);
    console.log(`Total Duration: ${doc.totalDuration}`);
    console.log(`Final Video Path: ${doc.finalVideoPath || "None"}`);
    console.log(`Raw Script snippet: ${doc.script ? doc.script.slice(0, 300) : "None"}...\n`);

    console.log(`=== PROJECT ASSETS (${doc.assets.length}) ===`);
    for (const a of doc.assets) {
        console.log(`- Asset [${a.type}] label="${a.label}" imagePath="${a.imagePath || 'None'}"`);
    }

    console.log(`\n=== PROJECT SCENES (${doc.scenes.length}) ===`);
    for (const s of doc.scenes) {
        console.log(`\n--- Scene ${s.sceneIndex + 1} (ID: ${s.id}) ---`);
        console.log(`Narration Text: "${s.narrationText}"`);
        console.log(`Narration Path: ${s.narrationPath || 'None'}`);
        console.log(`Assembled Path: ${s.assembledPath || 'None'}`);
        console.log(`Search Queries Raw: ${s.searchQueries || 'None'}`);

        if (s.shots && s.shots.length > 0) {
            console.log(`Shots (${s.shots.length}):`);
            for (const shot of s.shots) {
                console.log(`  - Shot ${shot.shotIndex + 1}: type=${shot.shotType} angle=${shot.cameraAngle} clipPath=${shot.clipPath || 'None'}`);
            }
        }
    }
}

inspectDoc().catch(console.error);
