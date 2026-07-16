import { prisma } from "../lib/prisma";
import dotenv from "dotenv";
dotenv.config();

async function main() {
    console.log("Database URL:", process.env.DATABASE_URL ? "SET" : "NOT SET");
    const userCount = await prisma.user.count();
    console.log("Total Users in DB:", userCount);
    
    const users = await prisma.user.findMany({
        take: 5,
        select: { id: true, email: true, name: true }
    });
    console.log("Recent Users:", users);

    const apiKeys = await prisma.apiKey.findMany();
    console.log("API Keys in DB:", apiKeys.map(k => ({ id: k.id, service: k.service, hasKey: !!k.key })));

    const docs = await prisma.documentary.findMany({
        take: 5,
        select: { id: true, title: true, status: true, userId: true }
    });
    console.log("Recent Documentaries:", docs);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
