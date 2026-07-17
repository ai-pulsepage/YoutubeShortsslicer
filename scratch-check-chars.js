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
    console.log(`Checking character assets for project "${projectId}"...`);
    const assets = await prisma.docAsset.findMany({
        where: { documentaryId: projectId }
    });

    console.log("Assets:", JSON.stringify(assets, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
