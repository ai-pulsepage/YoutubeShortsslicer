import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { text, voice } = await req.json();
    if (!text || !voice) {
        return NextResponse.json({ error: "Text and voice are required" }, { status: 400 });
    }

    const moneyPrinterUrl = process.env.MONEY_PRINTER_URL || "http://localhost:8080";

    try {
        console.log(`[Voice Preview] Dispatching preview request for voice "${voice}"`);
        const createRes = await fetch(`${moneyPrinterUrl}/api/v1/audio`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                video_script: text,
                voice_name: voice,
                bgm_type: "none",
                bgm_file: "",
                bgm_volume: 0,
                voice_volume: 1.0,
                voice_rate: 1.2
            })
        });

        if (!createRes.ok) {
            const errText = await createRes.text();
            throw new Error(`Failed to create preview task: ${errText}`);
        }

        const createData = await createRes.json();
        const task = createData.data || createData;
        const taskId = task.task_id;

        if (!taskId) {
            throw new Error("No task_id returned from MoneyPrinterTurbo");
        }

        // Poll for completion (up to 15 seconds max for short previews)
        let attempts = 0;
        let isDone = false;
        let isFailed = false;

        while (attempts < 10 && !isDone && !isFailed) {
            await new Promise(r => setTimeout(r, 1500));
            attempts++;

            const statusRes = await fetch(`${moneyPrinterUrl}/api/v1/tasks/${taskId}`, {
                headers: { "Accept": "application/json" }
            });
            if (!statusRes.ok) continue;

            const statusData = await statusRes.json();
            const statusTask = statusData.data || statusData;

            if (statusTask.state === 1) {
                isDone = true;
            } else if (statusTask.state === -1) {
                isFailed = true;
            }
        }

        if (!isDone) {
            throw new Error(isFailed ? "Audio synthesis failed on worker" : "Audio synthesis timed out");
        }

        // Stream the finished audio file back to client
        const audioUrl = `${moneyPrinterUrl}/tasks/${taskId}/audio.mp3`;
        const audioFetch = await fetch(audioUrl);
        if (!audioFetch.ok) {
            throw new Error(`Failed to retrieve generated audio file: ${audioFetch.statusText}`);
        }

        const audioBuffer = await audioFetch.arrayBuffer();

        return new NextResponse(audioBuffer, {
            headers: {
                "Content-Type": "audio/mpeg",
                "Content-Length": audioBuffer.byteLength.toString(),
            }
        });

    } catch (err: any) {
        console.error("[Voice Preview] Error:", err.message);
        return NextResponse.json({ error: "Failed to generate preview", details: err.message }, { status: 500 });
    }
}
