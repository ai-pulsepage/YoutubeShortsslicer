const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const pg = require('pg');

const pool = new pg.Pool({
    connectionString: "postgresql://postgres:LXPfvoDpzjhIyQkRHWwcYIfMtTuqLMQg@yamanote.proxy.rlwy.net:44103/railway",
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    const keys = await prisma.apiKey.findMany();
    for (const row of keys) {
        let val = "";
        try {
            val = Buffer.from(row.key, 'base64').toString('utf8');
        } catch {
            val = row.key;
        }
        console.log(`${row.service}: ${val}`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
