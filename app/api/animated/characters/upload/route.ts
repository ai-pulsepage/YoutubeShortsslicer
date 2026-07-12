import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadBufferToR2 } from "@/lib/storage";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        const charId = formData.get("characterId") as string;

        if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

        const buffer = Buffer.from(await file.arrayBuffer());
        const ext = file.name.split(".").pop() || "png";
        
        // Store in R2 bucket under avatars/ folder
        const filename = charId ? `${charId}.${ext}` : `${Date.now()}.${ext}`;
        const r2Key = `avatars/${filename}`;

        await uploadBufferToR2(buffer, r2Key, file.type || "image/png");

        return NextResponse.json({ success: true, imagePath: r2Key });
    } catch (err: any) {
        console.error("[Character Avatar Upload POST] failed:", err.message);
        return NextResponse.json({ error: "Failed to upload avatar image", details: err.message }, { status: 500 });
    }
}
