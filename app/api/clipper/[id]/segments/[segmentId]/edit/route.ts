import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * PATCH /api/clipper/[id]/segments/[segmentId]/edit
 * Save user edits on a segment (hookText, editedWords) before rendering.
 *
 * Body: { hookText?: string, hookFontSize?: number, hookFont?: string, editedWords?: Array<{text, start, end}> }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; segmentId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, segmentId } = await params;
  const body = await req.json();
  const { hookText, hookFontSize, hookFont, editedWords } = body;

  // Verify project ownership
  const project = await prisma.clipProject.findUnique({
    where: { id, userId: session.user.id },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Verify segment belongs to project's video
  const segment = await prisma.segment.findFirst({
    where: { id: segmentId, videoId: project.videoId },
  });

  if (!segment) {
    return NextResponse.json({ error: "Segment not found" }, { status: 404 });
  }

  // Build update data
  const updateData: any = {};
  if (hookText !== undefined) {
    updateData.hookText = hookText || null;
  }
  if (hookFontSize !== undefined) {
    updateData.hookFontSize = hookFontSize ? parseInt(hookFontSize) : null;
  }
  if (hookFont !== undefined) {
    updateData.hookFont = hookFont || null;
  }
  if (editedWords !== undefined) {
    // Validate editedWords format
    if (editedWords !== null && Array.isArray(editedWords)) {
      const valid = editedWords.every(
        (w: any) =>
          typeof w.text === "string" &&
          typeof w.start === "number" &&
          typeof w.end === "number"
      );
      if (!valid) {
        return NextResponse.json(
          { error: "editedWords must be an array of {text, start, end}" },
          { status: 400 }
        );
      }
    }
    updateData.editedWords = editedWords || null;
  }

  const updated = await prisma.segment.update({
    where: { id: segmentId },
    data: updateData,
  });

  return NextResponse.json({
    message: "Segment updated",
    hookText: updated.hookText,
    editedWords: updated.editedWords,
  });
}
