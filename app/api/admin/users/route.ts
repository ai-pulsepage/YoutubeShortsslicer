import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase());

function isAdmin(email?: string | null): boolean {
    return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * GET /api/admin/users
 * List all users with video counts and subscription info
 */
export async function GET() {
    const session = await auth();
    if (!isAdmin(session?.user?.email)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const users = await prisma.user.findMany({
        select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
            createdAt: true,
            _count: {
                select: {
                    videos: true,
                    channels: true,
                },
            },
            subscription: {
                select: {
                    plan: true,
                    status: true,
                    currentPeriodEnd: true,
                },
            },
        },
        orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(users);
}

/**
 * PATCH /api/admin/users
 * Update a user's role
 */
export async function PATCH(req: Request) {
    const session = await auth();
    if (!isAdmin(session?.user?.email)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { userId, role } = body;

    if (!userId || !["USER", "ADMIN"].includes(role)) {
        return NextResponse.json({ error: "Invalid request: userId and role (USER|ADMIN) required" }, { status: 400 });
    }

    const updated = await prisma.user.update({
        where: { id: userId },
        data: { role },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
        },
    });

    return NextResponse.json(updated);
}
