import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadBufferToR2 } from "@/lib/storage";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const segmentId = formData.get("segmentId") as string;
    if (!file || !segmentId) return NextResponse.json({ error: "Missing params" }, { status: 400 });

    const key = `ugc/cam-overlays/${session.user.id}/${segmentId}/cam.webm`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadBufferToR2(buffer, key, "video/webm");
    return NextResponse.json({ key });
}
