import type {
  BookBuildJob,
  BookBuildJobStatus,
  BookBuildMode,
  BookProject,
  BookSpread,
} from "@/types/printBook";
import { getBookProjectStageLabel } from "@/lib/print-books/status";

export const BOOK_JOB_STALE_MS = 5 * 60 * 1000;

export function getNowIso() {
  return new Date().toISOString();
}

export function isTerminalJobStatus(status: BookBuildJobStatus) {
  return status === "completed" || status === "failed";
}

export function shouldSendBookReadyEmail(input: {
  mode: BookBuildMode;
  project: BookProject;
}) {
  return input.mode === "full" && !input.project.assets.bookReadyEmailSentAt;
}

export function getNextProofVersion(project: BookProject): number {
  return (project.assets.proofVersion ?? 0) + 1;
}

export function isGeneratedPageSpread(spread: BookSpread) {
  return (
    spread.layoutType === "text_art" ||
    spread.layoutType === "hero" ||
    spread.layoutType === "quiet"
  );
}

export function hasUnresolvedGeneratedPageImages(spreads: BookSpread[]) {
  return spreads.some(
    (spread) =>
      isGeneratedPageSpread(spread) &&
      (!(spread.leftPageImageUrl ?? spread.imageUrl) ||
        Boolean(spread.leftPageImageError))
  );
}

export function clearResolvedGeneratedPageImageErrors(spreads: BookSpread[]) {
  return spreads.map((spread) => {
    if (!isGeneratedPageSpread(spread)) return spread;
    if (!(spread.leftPageImageUrl ?? spread.imageUrl)) return spread;
    if (!spread.leftPageImageError && !spread.rightPageImageError)
      return spread;

    return {
      ...spread,
      leftPageImageError: undefined,
      rightPageImageError: undefined,
    };
  });
}

export function isBookBuildJobStale(job: BookBuildJob, now = Date.now()) {
  if (isTerminalJobStatus(job.status)) return false;
  const updatedAt = Date.parse(job.updatedAt);
  if (Number.isNaN(updatedAt)) return true;
  return now - updatedAt > BOOK_JOB_STALE_MS;
}

export function getQueuedStageLabel(mode: BookBuildMode, project: BookProject) {
  switch (mode) {
    case "art":
      return `Queued to generate final art for ${project.spreads.length} spreads...`;
    case "exports":
      return "Queued to refresh export files...";
    case "finalize":
      return "Queued to finalize the order package...";
    default:
      return getBookProjectStageLabel("queued");
  }
}
