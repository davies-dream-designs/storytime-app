import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  enqueueBookBuildJob,
  isBookBuildJobStale,
} from "@/lib/print-books/jobs";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";
import type { BookBuildJob, BookProject } from "@/types/printBook";

async function requestBookBuild(
  job: BookBuildJob,
  userId: string,
  options: { refreshQueueTimestamp?: boolean } = {}
) {
  if (options.refreshQueueTimestamp) {
    await db.bookBuildJobs.update(job.id, {
      status: "queued",
      currentStepLabel:
        job.status === "running"
          ? "Restarting stalled build..."
          : job.currentStepLabel,
    });
  }

  await inngest.send({
    name: INNGEST_EVENTS.bookBuildRequested,
    data: { jobId: job.id, userId },
  });
}

function canRecoverExportJob(
  project: BookProject,
  options: { ignoreActiveJob?: boolean } = {}
) {
  const hasActiveJob =
    project.assets.activeJobId || project.assets.activeJobStatus;

  return (
    (options.ignoreActiveJob || !hasActiveJob) &&
    (project.status === "composing" || project.status === "proofing") &&
    Boolean(project.assets.coverImageUrl) &&
    project.totalSpreads > 0 &&
    project.completedSpreads >= project.totalSpreads
  );
}

async function recoverExportJob(project: BookProject, baseUrl: string) {
  const { job } = await enqueueBookBuildJob({
    project,
    mode: "exports",
    baseUrl,
  });
  await requestBookBuild(job, project.userId);
}

export async function GET(
  req: NextRequest,
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
    (project.assets.activeJobStatus === "queued" ||
      project.assets.activeJobStatus === "running")
  ) {
    const job = await db.bookBuildJobs.getById(project.assets.activeJobId);
    if (
      (job?.status === "queued" && isBookBuildJobStale(job)) ||
      (job?.status === "running" && isBookBuildJobStale(job))
    ) {
      await requestBookBuild(job, project.userId, {
        refreshQueueTimestamp: true,
      });
    } else if (
      (!job || job.status === "completed" || job.status === "failed") &&
      canRecoverExportJob(project, { ignoreActiveJob: true })
    ) {
      await recoverExportJob(project, req.nextUrl.origin);
    }
  } else if (canRecoverExportJob(project)) {
    await recoverExportJob(project, req.nextUrl.origin);
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
