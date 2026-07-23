import type { BookProject, BookSpread } from "@/types/printBook";
import { isDownloadableBookAssetUrl } from "@/lib/print-books/assets";

export type BookReadinessState =
  "building" | "failed" | "draft_ready" | "export_ready" | "order_ready";

export function hasBlockingProofingIssue(
  project: Pick<BookProject, "assets">
): boolean {
  return Boolean(
    project.assets.proofingErrors && project.assets.proofingErrors.length > 0
  );
}

export function hasDownloadableBookExport(
  project: Pick<BookProject, "assets">
): boolean {
  return (
    isDownloadableBookAssetUrl(project.assets.coverPdfUrl) ||
    isDownloadableBookAssetUrl(project.assets.printPdfUrl)
  );
}

export function isGeneratedBookPageSpread(
  spread: Pick<BookSpread, "sequence" | "title">
) {
  return (
    spread.sequence > 1 &&
    spread.title !== "Title" &&
    spread.title !== "Back Cover"
  );
}

export function hasUnresolvedGeneratedBookPageImages(
  spreads: Array<
    Pick<BookSpread, "sequence" | "title" | "imageUrl" | "leftPageImageUrl">
  >
) {
  return spreads.some(
    (spread) =>
      isGeneratedBookPageSpread(spread) &&
      !(spread.leftPageImageUrl ?? spread.imageUrl)
  );
}

function hasGeneratedBookPageSpreads(
  spreads: Array<Pick<BookSpread, "sequence" | "title">>
) {
  return spreads.some((spread) => isGeneratedBookPageSpread(spread));
}

export function hasResolvedImageFailure(
  project: Pick<BookProject, "status" | "errorCode" | "spreads" | "assets">
) {
  return (
    project.status === "failed" &&
    project.errorCode === "illustrating:image_failed" &&
    !project.assets.activeJobStatus &&
    hasGeneratedBookPageSpreads(project.spreads) &&
    !hasUnresolvedGeneratedBookPageImages(project.spreads)
  );
}

export function getEffectiveBookProjectStatus(
  project: Pick<BookProject, "status" | "errorCode" | "spreads" | "assets">
) {
  return hasResolvedImageFailure(project) ? "ready" : project.status;
}

export function getBookReadinessState(
  project: Pick<BookProject, "status" | "errorCode" | "spreads" | "assets">
): BookReadinessState {
  const status = getEffectiveBookProjectStatus(project);
  if (status === "failed") return "failed";
  if (status !== "ready") return "building";
  if (!hasDownloadableBookExport(project)) return "draft_ready";
  if (
    project.assets.orderabilityState === "order_ready" &&
    !hasBlockingProofingIssue(project)
  )
    return "order_ready";
  return "export_ready";
}
