import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const libraryDoc = await prisma.documentary.findFirst({
            where: {
                userId: session.user.id,
                genre: "children_library"
            },
            include: {
                assets: {
                    where: { type: "CHARACTER" }
                }
            }
        });

        if (!libraryDoc) {
            return NextResponse.json({ characters: [] });
        }

        const characters = libraryDoc.assets.map(a => {
            let wizardMetadata = null;
            if (a.description) {
                try {
                    wizardMetadata = JSON.parse(a.description);
                } catch (e) {
                    // Fallback for raw text description
                }
            }
            return {
                id: a.id,
                name: a.label,
                prompt: a.prompt || "",
                imagePath: a.imagePath || "",
                wizardMetadata
            };
        });

        return NextResponse.json({ characters });

    } catch (err: any) {
        console.error("[Get Character Library] Error:", err.message);
        return NextResponse.json({ error: "Failed to load library", details: err.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name, prompt, imagePath, wizardMetadata } = await req.json();
    if (!name) return NextResponse.json({ error: "Character name is required" }, { status: 400 });

    try {
        // 1. Locate or create the private global library project vault
        let libraryDoc = await prisma.documentary.findFirst({
            where: {
                userId: session.user.id,
                genre: "children_library"
            }
        });

        if (!libraryDoc) {
            libraryDoc = await prisma.documentary.create({
                data: {
                    userId: session.user.id,
                    title: "Global Animated Characters Library",
                    genre: "children_library",
                    status: "DRAFT"
                }
            });
        }

        // 2. Search for existing character asset with the same name to avoid duplicates
        const existing = await prisma.docAsset.findFirst({
            where: {
                documentaryId: libraryDoc.id,
                label: name
            }
        });

        const serializedDescription = wizardMetadata ? JSON.stringify(wizardMetadata) : null;

        if (existing) {
            await prisma.docAsset.update({
                where: { id: existing.id },
                data: {
                    prompt,
                    description: serializedDescription,
                    imagePath: imagePath || null
                }
            });
        } else {
            await prisma.docAsset.create({
                data: {
                    documentaryId: libraryDoc.id,
                    type: "CHARACTER",
                    label: name,
                    prompt,
                    description: serializedDescription,
                    imagePath: imagePath || null
                }
            });
        }

        return NextResponse.json({ success: true });

    } catch (err: any) {
        console.error("[Save Character Library] Error:", err.message);
        return NextResponse.json({ error: "Failed to save to library", details: err.message }, { status: 500 });
    }
}
