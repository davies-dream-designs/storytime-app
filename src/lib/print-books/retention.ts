import { db } from "@/lib/db";
import {
  collectBookDownloadableAssetUrls,
  deleteBookAssetUrls,
} from "@/lib/print-books/storage";
import type { BookProject } from "@/types/printBook";

export const BOOK_FILE_RETENTION_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

function parseTime(value?: string) {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
}

function toIsoDate(time: number) {
  return new Date(time).toISOString();
}

export function getBookFileRetentionAnchor(project: BookProject) {
  const candidates = [
    parseTime(project.readyAt),
    parseTime(project.printOrder?.paidAt),
    parseTime(project.printOrder?.fulfillment?.submittedAt),
  ].filter((time): time is number => time !== undefined);

  if (candidates.length === 0) return undefined;
  return toIsoDate(Math.max(...candidates));
}

export function getBookFilesAvailableUntil(project: BookProject) {
  const anchor = getBookFileRetentionAnchor(project);
  if (!anchor) return undefined;
  return toIsoDate(
    new Date(anchor).getTime() + BOOK_FILE_RETENTION_DAYS * DAY_MS
  );
}

export function getBookFileRetentionState(
  project: BookProject,
  now = new Date()
) {
  const availableUntil = getBookFilesAvailableUntil(project);
  const archivedAt = project.assets.downloadableFilesArchivedAt;
  const isArchived = Boolean(archivedAt);
  const daysRemaining = availableUntil
    ? Math.ceil((new Date(availableUntil).getTime() - now.getTime()) / DAY_MS)
    : undefined;

  return {
    availableUntil,
    archivedAt,
    isArchived,
    isExpired:
      !isArchived &&
      daysRemaining !== undefined &&
      daysRemaining <= 0,
    daysRemaining,
    retentionDays: BOOK_FILE_RETENTION_DAYS,
  };
}

export async function archiveBookDownloadableFiles(input: {
  project: BookProject;
  reason: "retention" | "manual";
  now?: Date;
}) {
  const urls = collectBookDownloadableAssetUrls(input.project);
  const deletedAssetCount = await deleteBookAssetUrls(urls);
  const archivedAt = (input.now ?? new Date()).toISOString();

  const updated = await db.bookProjects.update(input.project.id, {
    assets: {
      ...input.project.assets,
      coverPdfUrl: undefined,
      luluCoverPdfUrl: undefined,
      previewPdfUrl: undefined,
      printPdfUrl: undefined,
      luluPrintPdfUrl: undefined,
      epubUrl: undefined,
      previewImages: undefined,
      downloadableFilesArchivedAt: archivedAt,
      downloadableFilesArchiveReason: input.reason,
      orderabilityState: "draft_only",
      proofingPassed: false,
    },
  });

  if (!updated) throw new Error("Book project not found");
  return { project: updated, deletedAssetCount };
}
