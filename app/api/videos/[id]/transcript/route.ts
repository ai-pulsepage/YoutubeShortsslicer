import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/videos/[id]/transcript — return transcript with word-level timestamps
export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    const transcript = await prisma.transcript.findUnique({
        where: { videoId: id },
    });

    if (!transcript) {
        return NextResponse.json({ error: "No transcript found" }, { status: 404 });
    }

    return NextResponse.json(transcript);
}
