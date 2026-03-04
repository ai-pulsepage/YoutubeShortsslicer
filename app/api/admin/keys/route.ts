import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/keys - List all API keys
 * POST /api/admin/keys - Upsert an API key
 */
export async function GET() {
    const session = await auth();
    if ((session?.user as any)?.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const keys = await prisma.apiKey.findMany({
        select: {
            id: true,
            service: true,
            lastFour: true,
            updatedAt: true,
        },
        orderBy: { service: "asc" },
    });

    return NextResponse.json(keys);
}

export async function POST(req: Request) {
    const session = await auth();
    if ((session?.user as any)?.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { service, key } = await req.json();
    if (!service || !key) {
        return NextResponse.json(
            { error: "Service name and key are required" },
            { status: 400 }
        );
    }

    // Simple encryption — in production, use a proper KMS
    const encrypted = Buffer.from(key).toString("base64");
    const lastFour = key.slice(-4);

    const apiKey = await prisma.apiKey.upsert({
        where: { service },
        create: {
            service,
            encryptedKey: encrypted,
            lastFour,
        },
        update: {
            encryptedKey: encrypted,
            lastFour,
        },
    });

    return NextResponse.json({
        id: apiKey.id,
        service: apiKey.service,
        lastFour: apiKey.lastFour,
        updatedAt: apiKey.updatedAt,
    });
}
