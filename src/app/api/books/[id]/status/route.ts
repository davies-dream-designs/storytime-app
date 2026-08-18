import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { dispatchBookBuildJob } from "@/lib/print-books/jobs";

function sanitizeStoredImageError(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (
    raw.includes("OpenAI image generation failed") ||
    raw.includes("string_above_max_length") ||
    raw.includes("Invalid 'prompt'") ||
    raw.includes("400 {") ||
    raw.includes("429 {") ||
    raw.includes("OPENAI_API_KEY")
  ) {
    return "This illustration could not be generated. Tap Retry to try again.";
  }
  return raw;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const project = await db.bookProjects.getById(id);
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (
    project.assets.activeJobId &&
    project.assets.activeJobStatus === "queued"
  ) {
    const job = await db.bookBuildJobs.getById(project.assets.activeJobId);
    if (job?.status === "queued") {
      await dispatchBookBuildJob(job);
    }
  }

  return NextResponse.json({
    id: project.id,
    status: project.status,
    currentStageLabel: project.currentStageLabel,
    completedSpreads: project.completedSpreads,
    totalSpreads: project.totalSpreads,
    updatedAt: project.updatedAt,
    readyAt: project.readyAt,
    errorCode: project.errorCode,
    errorMessage: project.errorMessage,
    spreadPreviews: project.spreads
      .filter(
        (s) =>
          s.layoutType === "text_art" ||
          s.layoutType === "hero" ||
          s.layoutType === "quiet"
      )
      .map((s) => ({
        id: s.id,
        sequence: s.sequence,
        title: s.title,
        layoutType: s.layoutType,
        thumbnailUrl:
          s.thumbnailUrl ?? s.leftPageWebImageUrl ?? s.imageUrl ?? undefined,
        webImageUrl: s.leftPageWebImageUrl ?? s.thumbnailUrl ?? undefined,
        leftPageImageUrl: s.leftPageImageUrl ?? s.imageUrl ?? undefined,
        rightPageImageUrl: s.rightPageImageUrl ?? undefined,
        leftPageImageError: sanitizeStoredImageError(s.leftPageImageError),
        rightPageImageError: sanitizeStoredImageError(s.rightPageImageError),
      })),
    assets: {
      lastBuildMode: project.assets.lastBuildMode,
      activeJobId: project.assets.activeJobId,
      activeJobMode: project.assets.activeJobMode,
      activeJobStatus: project.assets.activeJobStatus,
      activeJobUpdatedAt: project.assets.activeJobUpdatedAt,
      artMode: project.assets.artMode,
      artGenerationCursor: project.assets.artGenerationCursor,
      artGenerationTotal: project.assets.artGenerationTotal,
      openAIImageBatch: project.assets.openAIImageBatch,
      orderabilityState: project.assets.orderabilityState,
      exportVersion: project.assets.exportVersion,
      finalExportVersion: project.assets.finalExportVersion,
      proofVersion: project.assets.proofVersion,
    },
    printOrder: project.printOrder
      ? {
          productKey: project.printOrder.productKey,
          productLabel: project.printOrder.productLabel,
          status: project.printOrder.status,
          amountAud: project.printOrder.amountAud,
          pageCount: project.printOrder.pageCount,
          paidAt: project.printOrder.paidAt,
          fulfillment: project.printOrder.fulfillment
            ? {
                provider: project.printOrder.fulfillment.provider,
                status: project.printOrder.fulfillment.status,
                preparedAt: project.printOrder.fulfillment.preparedAt,
                submittedAt: project.printOrder.fulfillment.submittedAt,
                externalOrderId: project.printOrder.fulfillment.externalOrderId,
                externalStatus: project.printOrder.fulfillment.externalStatus,
                message: project.printOrder.fulfillment.message,
              }
            : undefined,
        }
      : undefined,
  });
}
