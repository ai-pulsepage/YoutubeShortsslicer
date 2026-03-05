import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/keys - List all API keys (masked)
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
            key: true,
            label: true,
            isActive: true,
            updatedAt: true,
        },
        orderBy: { service: "asc" },
    });

    // Return masked keys so admin can see what's configured
    const masked = keys.map((k) => {
        let maskedKey = "••••••••";
        try {
            const decoded = Buffer.from(k.key, "base64").toString("utf8");
            if (decoded.length > 8) {
                maskedKey = `${decoded.slice(0, 4)}...${decoded.slice(-4)}`;
            } else if (decoded.length > 0) {
                maskedKey = `${decoded.slice(0, 2)}...`;
            }
        } catch { }
        return { ...k, key: maskedKey };
    });

    return NextResponse.json(masked);
}

export async function POST(req: Request) {
    const session = await auth();
    if ((session?.user as any)?.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { service, key, label } = await req.json();
    if (!service || !key) {
        return NextResponse.json(
            { error: "Service name and key are required" },
            { status: 400 }
        );
    }

    // Simple encryption — in production, use a proper KMS
    const encrypted = Buffer.from(key).toString("base64");

    const apiKey = await prisma.apiKey.upsert({
        where: { service },
        create: {
            service,
            key: encrypted,
            label: label || service,
        },
        update: {
            key: encrypted,
            label: label || undefined,
        },
    });

    return NextResponse.json({
        id: apiKey.id,
        service: apiKey.service,
        label: apiKey.label,
        updatedAt: apiKey.updatedAt,
    });
}
