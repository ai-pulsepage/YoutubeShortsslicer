import { NextResponse } from "next/server";
import { getAiLogContent } from "@/lib/logging/ai-logger";

export async function GET() {
    try {
        const content = getAiLogContent();
        return new NextResponse(content, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Content-Disposition": 'attachment; filename="ai_generation.log"'
            }
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || "Failed to read log file" }, { status: 500 });
    }
}
