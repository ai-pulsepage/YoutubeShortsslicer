const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const pg = require("pg");

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    const projectId = "cmrkk70g800000ep23astmpem";
    console.log(`Inspecting visualShots metadata for project "${projectId}"...`);
    const project = await prisma.documentary.findUnique({
        where: { id: projectId },
        include: { scenes: { orderBy: { sceneIndex: "asc" } } }
    });

    if (!project) {
        console.error("Project not found!");
        return;
    }

    project.scenes.forEach(scene => {
        let meta = {};
        try {
            meta = JSON.parse(scene.searchQueries || "{}");
        } catch {}
        console.log(`Scene ${scene.sceneIndex + 1} (ID: ${scene.id}) | assembledPath: "${scene.assembledPath}"`);
        console.log("  visualShots:", JSON.stringify(meta.visualShots, null, 2));
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
