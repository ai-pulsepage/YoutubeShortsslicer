import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const idsString = searchParams.get("jobIds");
    if (!idsString) return NextResponse.json({ jobs: [] });

    const jobIds = idsString.split(",");

    try {
        const jobs = await prisma.genJob.findMany({
            where: {
                id: { in: jobIds }
            }
        });

        return NextResponse.json({ jobs });
    } catch (err: any) {
        console.error("[Scene Video Status] Error:", err.message);
        return NextResponse.json({ error: "Failed to query status", details: err.message }, { status: 500 });
    }
}
