import { db } from "@/lib/db";
import { refundIllustratedBookCredits } from "@/lib/credits";
import { getBookProjectStageLabel } from "@/lib/print-books/status";
import { logEvent } from "@/lib/logEvent";
import { AppError, type ErrorCode } from "@/lib/errors";
import type { BookProject } from "@/types/printBook";
import { getNowIso } from "./utils";

// Map a coarse stage-derived failure code to a specific taxonomy code used for
// the event log. The book row keeps the stage code (recovery UI keys off it);
// the event log gets the richer classification.
function stageFailureToErrorCode(stageCode: string): ErrorCode {
  if (stageCode.startsWith("planning")) return "book.planning_failed";
  if (stageCode.startsWith("bible")) return "book.bible_failed";
  if (stageCode.startsWith("illustrating")) return "book.illustration_failed";
  if (stageCode.startsWith("proofing")) return "book.proofing_failed";
  return "book.illustration_failed";
}

export function userMessageForErrorCode(errorCode: string): string {
  if (errorCode.startsWith("planning"))
    return "We hit a snag planning the book. Hit retry - it usually clears up.";
  if (errorCode.startsWith("bible"))
    return "The character setup didn't finish. Retry to pick up where it left off.";
  if (errorCode.startsWith("illustrating"))
    return "Illustrations didn't finish generating. Retry and we'll pick up from where it stopped.";
  if (errorCode.startsWith("proofing"))
    return "Export refresh didn't finish. Your book is still available; refresh the PDFs again to retry.";
  return "The illustrated book didn't finish. Your credits have been refunded. Hit retry to try again.";
}

export async function markJobProjectFailure(
  project: BookProject,
  jobId: string,
  errorCode: string,
  message: string,
  cause?: unknown
) {
  await refundIllustratedBookCredits(project);

  await db.bookProjects.update(project.id, {
    status: "failed",
    currentStageLabel: getBookProjectStageLabel("failed"),
    errorCode,
    errorMessage: userMessageForErrorCode(errorCode),
    rawError: message,
    assets: {
      ...project.assets,
      activeJobId: undefined,
      activeJobMode: undefined,
      activeJobStatus: undefined,
      activeJobUpdatedAt: undefined,
    },
  });

  await Promise.all([
    db.bookBuildJobs.update(jobId, {
      status: "failed",
      errorMessage: message,
      completedAt: getNowIso(),
    }),
    db.bookProjects.addToFailedIndex(project.id),
  ]);

  await logEvent({
    error: cause,
    code: cause instanceof AppError ? cause.code : undefined,
    fallbackCode: stageFailureToErrorCode(errorCode),
    message,
    userId: project.userId,
    entityType: "book",
    entityId: project.id,
    source: "book/build",
    context: { stageCode: errorCode, jobId, retryCount: project.retryCount },
  });
}

export async function markExportJobFailure(
  project: BookProject,
  jobId: string,
  errorCode: string,
  message: string,
  cause?: unknown
) {
  await db.bookProjects.update(project.id, {
    status: project.status,
    currentStageLabel:
      project.status === "ready"
        ? getBookProjectStageLabel("ready")
        : project.currentStageLabel,
    errorCode,
    errorMessage: userMessageForErrorCode(errorCode),
    rawError: message,
    assets: {
      ...project.assets,
      activeJobId: undefined,
      activeJobMode: undefined,
      activeJobStatus: undefined,
      activeJobUpdatedAt: undefined,
    },
  });

  await db.bookBuildJobs.update(jobId, {
    status: "failed",
    errorMessage: message,
    completedAt: getNowIso(),
  });

  await logEvent({
    error: cause,
    code: cause instanceof AppError ? cause.code : undefined,
    fallbackCode: stageFailureToErrorCode(errorCode),
    message,
    userId: project.userId,
    entityType: "book",
    entityId: project.id,
    source: "book/exports",
    context: { stageCode: errorCode, jobId },
  });
}
