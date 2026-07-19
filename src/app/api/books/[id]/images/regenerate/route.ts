import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  chargeImageRegenerationCredit,
  captureIllustratedBookCredits,
  refundImageRegenerationCredit,
  refundIllustratedBookCredits,
  reserveIllustratedBookCredits,
} from "@/lib/credits";
import { db } from "@/lib/db";
import { regenerateBookSpreadPageImage } from "@/lib/print-books/jobs";
import type { BookProject } from "@/types/printBook";

type RegenerateImagePayload = {
  spreadId?: string;
  side?: "left" | "right";
};

function isPlaceholderImageUrl(url?: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.startsWith("data:image/svg") || lower.endsWith(".svg");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    const { id } = await params;
    console.warn("Book image regenerate unauthorized", { projectId: id });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await req
    .json()
    .catch(() => ({}))) as RegenerateImagePayload;
  const side =
    payload.side === "left" || payload.side === "right" ? payload.side : null;
  if (!payload.spreadId || !side) {
    return NextResponse.json(
      { error: "Choose a spread image to regenerate." },
      { status: 400 }
    );
  }

  let charged = false;
  let reservedBookCharge = false;
  let billableProject: BookProject | null = null;
  try {
    const { id } = await params;
    const currentProject = await db.bookProjects.getById(id);
    if (!currentProject || currentProject.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const currentSpread = currentProject.spreads.find(
      (spread) => spread.id === payload.spreadId
    );
    if (!currentSpread) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const currentUrl =
      side === "left"
        ? (currentSpread.leftPageImageUrl ?? currentSpread.imageUrl)
        : (currentSpread.rightPageImageUrl ?? currentSpread.imageUrl);
    const currentError =
      side === "left"
        ? currentSpread.leftPageImageError
        : currentSpread.rightPageImageError;
    const isPaidRedo =
      Boolean(currentUrl) &&
      !currentError &&
      !isPlaceholderImageUrl(currentUrl);

    if (isPaidRedo) {
      await chargeImageRegenerationCredit(userId);
      charged = true;
    } else if (
      currentProject.billing?.status !== "reserved" &&
      currentProject.billing?.status !== "captured"
    ) {
      billableProject = await reserveIllustratedBookCredits(currentProject);
      reservedBookCharge = true;
    }

    const project = await regenerateBookSpreadPageImage({
      projectId: id,
      userId,
      spreadId: payload.spreadId,
      side,
    });
    if (!project) throw new Error("Book project not found");

    if (project.billing?.status === "reserved" && project.status === "ready") {
      const capturedProject = await captureIllustratedBookCredits(project);
      return NextResponse.json(capturedProject);
    }

    return NextResponse.json(project);
  } catch (error) {
    if (charged) await refundImageRegenerationCredit(userId);
    if (reservedBookCharge && billableProject) {
      await refundIllustratedBookCredits(billableProject);
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /insufficient credits/i.test(message)
      ? 402
      : /not found/i.test(message)
        ? 404
        : /already running|complete draft|provider credentials|blob storage/i.test(
              message
            )
          ? 409
          : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
