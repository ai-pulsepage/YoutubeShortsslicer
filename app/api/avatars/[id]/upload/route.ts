import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadBufferToR2 } from "@/lib/storage";
import path from "path";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    // Verify avatar ownership
    const avatar = await prisma.uGCAvatar.findFirst({
        where: { id, userId: session.user.id }
    });
    if (!avatar) return NextResponse.json({ error: "Avatar not found" }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const type = formData.get("type") as string; // image | video | voice

    if (!file || !type) {
        return NextResponse.json({ error: "Missing file or type" }, { status: 400 });
    }

    if (!["image", "video", "voice"].includes(type)) {
        return NextResponse.json({ error: "Invalid upload type" }, { status: 400 });
    }

    // Map extensions
    let ext = "";
    if (file.name) {
        ext = path.extname(file.name);
    } else {
        if (type === "image") ext = ".png";
        else if (type === "video") ext = ".mp4";
        else ext = ".wav";
    }

    const key = `ugc/avatars/${session.user.id}/${id}/${type}_ref${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Map content-types
    let contentType = "application/octet-stream";
    if (type === "image") contentType = "image/png";
    else if (type === "video") contentType = "video/mp4";
    else if (type === "voice") contentType = "audio/wav";

    await uploadBufferToR2(buffer, key, contentType);

    // Update database references
    const updateData: Record<string, string> = {};
    if (type === "image") {
        updateData.referenceImageUrl = key;
        updateData.thumbnailUrl = key;
    } else if (type === "video") {
        updateData.referenceVideoUrl = key;
    } else if (type === "voice") {
        updateData.voiceRefPath = key;
    }

    const updatedAvatar = await prisma.uGCAvatar.update({
        where: { id },
        data: updateData
    });

    return NextResponse.json(updatedAvatar);
}
