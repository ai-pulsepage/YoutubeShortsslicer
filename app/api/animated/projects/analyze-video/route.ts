import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeVideoVisually } from "@/lib/documentary/video-analyzer";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { videoId } = await req.json();
    if (!videoId) return NextResponse.json({ error: "videoId is required" }, { status: 400 });

    try {
        console.log(`[Analyze Video Route] Starting visual analysis for video ${videoId}...`);
        const analysis = await analyzeVideoVisually(videoId);
        
        if (!analysis) {
            return NextResponse.json({ error: "Failed to extract or analyze visual keyframes" }, { status: 500 });
        }

        return NextResponse.json({ success: true, visualAnalysis: analysis });
    } catch (err: any) {
        console.error(`[Analyze Video Route] Error:`, err.message);
        return NextResponse.json({ error: "Visual analysis failed", details: err.message }, { status: 500 });
    }
}
