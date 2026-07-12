import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { downloadFileFromR2 } from "@/lib/storage";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { audioKey } = await req.json();
    if (!audioKey) return NextResponse.json({ error: "audioKey is required" }, { status: 400 });

    const tempDir = path.join(os.tmpdir(), `duration-probe-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
        const localPath = path.join(tempDir, "audio.mp3");
        console.log(`[Duration Probe] Downloading audio for probe: ${audioKey}`);
        await downloadFileFromR2(audioKey, localPath);

        const ffprobeRes = execSync(
            `ffprobe -i "${localPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
            { encoding: "utf8" }
        );
        const duration = parseFloat(ffprobeRes.trim()) || 5.0;
        console.log(`[Duration Probe] Result resolved: ${duration}s`);

        fs.rmSync(tempDir, { recursive: true, force: true });
        return NextResponse.json({ duration });

    } catch (err: any) {
        console.error("[Duration Probe] Error:", err.message);
        fs.rmSync(tempDir, { recursive: true, force: true });
        return NextResponse.json({ error: "Failed to probe duration", details: err.message }, { status: 500 });
    }
}
