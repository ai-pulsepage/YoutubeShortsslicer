import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        let libraryDoc = await prisma.documentary.findFirst({
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

        // Auto-create children_library doc if missing
        if (!libraryDoc) {
            libraryDoc = await prisma.documentary.create({
                data: {
                    userId: session.user.id,
                    title: "Global Animated Characters Library",
                    genre: "children_library",
                    status: "DRAFT"
                },
                include: {
                    assets: {
                        where: { type: "CHARACTER" }
                    }
                }
            });
        }

        // If empty, auto-populate the 6 template presets
        if (libraryDoc.assets.length === 0) {
            const PRESET_CHARACTERS = [
                { name: "Leo", prompt: "A young 3D Pixar style cartoon boy with bright green eyes, a wide joyful smile, and messy red hair. He wears a yellow t-shirt and blue denim shorts. His features are soft, round, and friendly. Styled in Pixar 3D digital animation look, shown against a neutral studio backdrop.", style: "Pixar 3D", subjectClass: "Human", species: "Boy", anthropomorphic: false, ageBracket: "Child" },
                { name: "Lily", prompt: "A cheerful 3D Pixar style cartoon princess girl with round brown eyes, black hair, and a sparkling gold crown. She wears a warm pink dress. Features are soft and rounded. Beautiful 3D cartoon style, shown on a plain studio backdrop.", style: "Pixar 3D", subjectClass: "Human", species: "Girl", anthropomorphic: false, ageBracket: "Child" },
                { name: "Bingo", prompt: "A cute anthropomorphic 3D cartoon bunny with big, curious round eyes and fluffy white fur. He wears a tiny blue vest. Cute, child-friendly features in 3D Pixar style, shown on a neutral plain background.", style: "Pixar 3D", subjectClass: "Animal", species: "Bunny", anthropomorphic: true, ageBracket: "Child" },
                { name: "Rex", prompt: "A friendly 3D cartoon baby green dinosaur with big round eyes, a happy smile, and a soft, smooth green skin texture. Cute anthropomorphic styling, Pixar look, shown on a plain studio backdrop.", style: "Pixar 3D", subjectClass: "Creature", species: "Dinosaur", anthropomorphic: true, ageBracket: "Child" },
                { name: "Rusty", prompt: "A shiny 3D toy robot with smiling digital eyes, colorful control buttons, and rounded steel-blue joints. Friendly cartoon style, clean child-friendly Pixar look, shown on a neutral backdrop.", style: "Pixar 3D", subjectClass: "Robot", species: "Robot", anthropomorphic: true, ageBracket: "Child" },
                { name: "Buddy", prompt: "An adorable anthropomorphic 3D golden retriever puppy with floppy ears and a red collar. Kind expression, happy smile, soft plush fur texture, Pixar cartoon style, shown on a plain studio background.", style: "Pixar 3D", subjectClass: "Animal", species: "Dog", anthropomorphic: true, ageBracket: "Child" }
            ];

            for (const preset of PRESET_CHARACTERS) {
                const wizardMetadata = {
                    style: preset.style,
                    subjectClass: preset.subjectClass,
                    species: preset.species,
                    anthropomorphic: preset.anthropomorphic,
                    ageBracket: preset.ageBracket,
                    attire: "",
                    customDetails: ""
                };
                await prisma.docAsset.create({
                    data: {
                        documentaryId: libraryDoc.id,
                        type: "CHARACTER",
                        label: preset.name,
                        prompt: preset.prompt,
                        description: JSON.stringify(wizardMetadata),
                        imagePath: null
                    }
                });
            }

            // Reload assets
            libraryDoc = await prisma.documentary.findUnique({
                where: { id: libraryDoc.id },
                include: {
                    assets: {
                        where: { type: "CHARACTER" }
                    }
                }
            }) || libraryDoc;
        }

        const characters = libraryDoc.assets.map(a => {
            let wizardMetadata: any = null;
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
                wizardMetadata,
                // TTS profile — stored inside wizardMetadata for backwards compat
                ttsProvider: wizardMetadata?.ttsProvider || null,
                ttsVoiceId: wizardMetadata?.ttsVoiceId || null,
            };
        });

        return NextResponse.json({
            characters,
            docId: libraryDoc ? libraryDoc.id : null
        });

    } catch (err: any) {
        console.error("[Get Character Library] Error:", err.message);
        return NextResponse.json({ error: "Failed to load library", details: err.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name, prompt, imagePath, wizardMetadata, ttsProvider, ttsVoiceId } = await req.json();
    if (!name) return NextResponse.json({ error: "Character name is required" }, { status: 400 });

    // Merge TTS fields into wizardMetadata so they travel with the character
    const mergedWizardMetadata = {
        ...(wizardMetadata || {}),
        ...(ttsProvider ? { ttsProvider } : {}),
        ...(ttsVoiceId  ? { ttsVoiceId  } : {}),
    };

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

        const serializedDescription = JSON.stringify(mergedWizardMetadata);

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
