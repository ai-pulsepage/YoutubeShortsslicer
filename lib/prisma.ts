import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

function createPrismaClient() {
    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 5, // Limit connections to prevent Railway database exhaustion
        idleTimeoutMillis: 10000, // Close idle connections after 10s
        connectionTimeoutMillis: 5000, // Fail fast on connection refusal
    });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
