import type {
  BookProject,
  BookProjectStatus,
  OpenAIImageBatchStatus,
} from "@/types/printBook";

const STATUS_LABELS: Record<BookProjectStatus, string> = {
  queued: "Dreaming up the adventure...",
  planning: "Dreaming up the adventure...",
  bible: "Sketching your little hero...",
  illustrating: "Painting moonlit pages...",
  composing: "Weaving the story into a real book...",
  proofing: "Tucking the final pages into place...",
  ready: "Your illustrated book is ready to order.",
  failed: "This book needs another try.",
};

export function getBookProjectStageLabel(status: BookProjectStatus): string {
  return STATUS_LABELS[status];
}

const BATCH_STATUS_LABELS: Record<OpenAIImageBatchStatus, string> = {
  validating: "validating",
  failed: "failed",
  in_progress: "in progress",
  finalizing: "finalizing",
  completed: "completed",
  expired: "expired",
  cancelling: "cancelling",
  cancelled: "cancelled",
};

const STATUS_PROGRESS: Record<BookProjectStatus, number> = {
  queued: 5,
  planning: 12,
  bible: 22,
  illustrating: 35,
  composing: 82,
  proofing: 92,
  ready: 100,
  failed: 0,
};

const BATCH_STATUS_PROGRESS: Record<OpenAIImageBatchStatus, number> = {
  validating: 42,
  in_progress: 58,
  finalizing: 72,
  completed: 78,
  failed: 0,
  expired: 0,
  cancelling: 45,
  cancelled: 0,
};

type BookProjectStatusView = Pick<
  BookProject,
  | "status"
  | "currentStageLabel"
  | "completedSpreads"
  | "totalSpreads"
  | "assets"
>;

function clampProgress(progress: number): number {
  return Math.max(0, Math.min(100, Math.round(progress)));
}

export function getOpenAIImageBatchStatusLabel(
  status: OpenAIImageBatchStatus
): string {
  return BATCH_STATUS_LABELS[status];
}

export function getBookProjectProgress(project: BookProjectStatusView): number {
  if (project.status !== "illustrating") {
    return STATUS_PROGRESS[project.status];
  }

  const spreadProgress =
    project.totalSpreads > 0
      ? 35 + (project.completedSpreads / project.totalSpreads) * 43
      : 0;
  const cursorProgress =
    project.assets.artGenerationTotal && project.assets.artGenerationTotal > 0
      ? 35 +
        ((project.assets.artGenerationCursor ?? 0) /
          project.assets.artGenerationTotal) *
          43
      : 0;
  const batchProgress = project.assets.openAIImageBatch
    ? BATCH_STATUS_PROGRESS[project.assets.openAIImageBatch.status]
    : 0;
  const waitingForBatchProgress = project.currentStageLabel.startsWith(
    "Waiting for final art batch"
  )
    ? BATCH_STATUS_PROGRESS.in_progress
    : 0;

  return clampProgress(
    Math.max(
      STATUS_PROGRESS.illustrating,
      spreadProgress,
      cursorProgress,
      batchProgress,
      waitingForBatchProgress
    )
  );
}

export function getBookProjectDisplayStageLabel(
  project: BookProjectStatusView
): string {
  // For terminal states use the live label so copy changes apply without a rebuild
  if (project.status === "ready" || project.status === "failed") {
    return getBookProjectStageLabel(project.status);
  }

  if (
    project.status === "illustrating" &&
    project.currentStageLabel.startsWith("Waiting for final art batch")
  ) {
    return "Waiting for final art batch...";
  }

  return project.currentStageLabel || getBookProjectStageLabel(project.status);
}
