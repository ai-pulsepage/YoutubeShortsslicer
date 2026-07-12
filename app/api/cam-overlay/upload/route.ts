import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadBufferToR2 } from "@/lib/storage";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        if (!file) return NextResponse.json({ error: "Missing file parameter" }, { status: 400 });

        const segmentId = (formData.get("segmentId") as string) || "general-uploads";
        
        // Resolve extension and content type dynamically
        const contentType = file.type || "application/octet-stream";
        let ext = ".mp3";
        if (contentType.includes("webm")) {
            ext = ".webm";
        } else if (contentType.includes("mp4")) {
            ext = ".mp4";
        } else if (contentType.includes("wav")) {
            ext = ".wav";
        } else if (file.name) {
            const dotIdx = file.name.lastIndexOf(".");
            if (dotIdx !== -1) ext = file.name.substring(dotIdx);
        }

        const key = `ugc/cam-overlays/${session.user.id}/${segmentId}/${Date.now()}${ext}`;
        const buffer = Buffer.from(await file.arrayBuffer());
        await uploadBufferToR2(buffer, key, contentType);

        return NextResponse.json({ key, path: key });

    } catch (err: any) {
        console.error("[Cam-Overlay Upload] Error:", err.message);
        return NextResponse.json({ error: "Upload failed", details: err.message }, { status: 500 });
    }
}
