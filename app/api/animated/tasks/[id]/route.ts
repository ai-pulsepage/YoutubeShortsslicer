import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const moneyPrinterUrl = process.env.MONEY_PRINTER_URL || "http://localhost:8085";

    try {
        const res = await fetch(`${moneyPrinterUrl}/api/v1/tasks/${id}`, {
            headers: { "Accept": "application/json" }
        });

        if (!res.ok) {
            return NextResponse.json({ error: "Task not found" }, { status: 404 });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (err: any) {
        console.error("[Animated Task Query] Proxy failed:", err.message);
        return NextResponse.json({ error: "Task retrieval failed", details: err.message }, { status: 500 });
    }
}
