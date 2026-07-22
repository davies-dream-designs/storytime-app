import { after, NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  dispatchBookBuildJob,
  isBookBuildJobStale,
} from "@/lib/print-books/jobs";

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

  const activeJob = project.assets.activeJobId
    ? await db.bookBuildJobs.getById(project.assets.activeJobId)
    : await db.bookBuildJobs.getCurrentByProjectId(project.id);

  if (activeJob && activeJob.projectId === project.id) {
    if (activeJob.status === "queued") {
      await dispatchBookBuildJob(activeJob);
    } else if (isBookBuildJobStale(activeJob)) {
      after(async () => {
        await dispatchBookBuildJob(activeJob);
      });
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
        thumbnailUrl: s.thumbnailUrl ?? s.imageUrl ?? undefined,
        leftPageImageUrl: s.leftPageImageUrl ?? s.imageUrl ?? undefined,
        rightPageImageUrl: undefined,
        leftPageImageError: s.leftPageImageError,
        rightPageImageError: undefined,
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
