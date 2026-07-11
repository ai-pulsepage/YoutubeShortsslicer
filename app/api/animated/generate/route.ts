import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { topic, aspectRatio, voiceName, bgmType, subtitleEnabled } = await req.json();
    if (!topic) return NextResponse.json({ error: "Topic is required" }, { status: 400 });

    const moneyPrinterUrl = process.env.MONEY_PRINTER_URL || "http://localhost:8080";
    const videoAspect = aspectRatio === "16:9" ? "16:9" : aspectRatio === "1:1" ? "1:1" : "9:16";

    try {
        console.log(`[Animated Generate] Proxying topic "${topic}" to MoneyPrinterTurbo at ${moneyPrinterUrl}`);
        const res = await fetch(`${moneyPrinterUrl}/api/v1/videos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                video_subject: topic,
                video_aspect: videoAspect,
                video_source: "pexels",
                voice_name: voiceName || "",
                bgm_type: bgmType || "random",
                subtitle_enabled: subtitleEnabled !== false
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`MoneyPrinterTurbo returned ${res.status}: ${errText}`);
        }

        const data = await res.json();
        // Forward JSON response containing task_id
        return NextResponse.json(data);
    } catch (err: any) {
        console.error("[Animated Generate] Proxy failed:", err.message);
        return NextResponse.json({ error: "MoneyPrinterTurbo integration failed", details: err.message }, { status: 500 });
    }
}
