import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { text, voice } = await req.json();
    if (!text || !voice) {
        return NextResponse.json({ error: "text and voice are required" }, { status: 400 });
    }

    const moneyPrinterUrl = process.env.MONEY_PRINTER_URL || "http://localhost:8080";

    try {
        console.log(`[Voice Preview] Previewing: "${text}" using voice ${voice}`);

        const audioRes = await fetch(`${moneyPrinterUrl}/api/v1/audio`, {
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

        if (!audioRes.ok) {
            throw new Error(`EdgeTTS preview failed: ${await audioRes.text()}`);
        }

        const createData = await audioRes.json();
        const task = createData.data || createData;
        const taskId = task.task_id;

        // Poll for audio synthesis task completion
        let attempts = 0;
        let isDone = false;
        while (attempts < 15 && !isDone) {
            await new Promise(r => setTimeout(r, 1000));
            attempts++;
            const statusRes = await fetch(`${moneyPrinterUrl}/api/v1/tasks/${taskId}`);
            if (statusRes.ok) {
                const statusData = await statusRes.json();
                const statusTask = statusData.data || statusData;
                if (statusTask.state === 1) isDone = true;
            }
        }

        if (!isDone) {
            throw new Error(`TTS synthesis task timed out`);
        }

        // Download synthesized audio file
        const audioUrl = `${moneyPrinterUrl}/tasks/${taskId}/audio.mp3`;
        const audioFetch = await fetch(audioUrl);
        if (!audioFetch.ok) {
            throw new Error(`Failed to download synthesized audio file`);
        }
        
        const audioBuffer = await audioFetch.arrayBuffer();

        return new Response(new Uint8Array(audioBuffer), {
            headers: {
                "Content-Type": "audio/mpeg",
                "Content-Length": audioBuffer.byteLength.toString(),
            },
        });

    } catch (err: any) {
        console.error("[Voice Preview] failed:", err.message);
        return NextResponse.json({ error: "Voice preview failed", details: err.message }, { status: 500 });
    }
}
