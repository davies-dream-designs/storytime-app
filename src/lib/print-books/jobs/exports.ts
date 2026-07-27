import { db } from "@/lib/db";
import { generateBookPdfs } from "@/lib/print-books/pdf";
import { generateBookEpub } from "@/lib/print-books/epub";
import { runStorycotPrintProofing } from "@/lib/print-books/proofing";
import { BOOK_SPEC } from "@/lib/print-books/bookConfig";
import { getBookProjectStageLabel } from "@/lib/print-books/status";
import type { BookBuildMode, BookProject } from "@/types/printBook";
import type { BuildContext } from "./context";
import { getNextProofVersion, getNowIso } from "./utils";

export async function finalizeProjectExports(input: {
  id: string;
  project: BookProject;
  story: BuildContext["story"];
  profile: BuildContext["profile"];
  buildMode: BookBuildMode;
}) {
  const nextProofVersion = getNextProofVersion(input.project);
  const pdfAssets = await generateBookPdfs({
    project: input.project,
    story: input.story,
    profile: input.profile,
  });
  const epubAssets = await generateBookEpub({
    project: input.project,
    story: input.story,
    profile: input.profile,
  });

  const proofingAssets = {
    ...input.project.assets,
    coverImageUrl: input.project.assets.coverImageUrl,
    coverPdfUrl: pdfAssets.coverPdfUrl,
    coverPdfReadyForOrdering: pdfAssets.coverPdfReadyForOrdering,
    coverPdfSpineWidthIn: pdfAssets.coverPdfSpineWidthIn,
    coverPdfSpineSource: pdfAssets.coverPdfSpineSource,
    coverPdfPageWidthIn: pdfAssets.coverPdfPageWidthIn,
    coverPdfPageHeightIn: pdfAssets.coverPdfPageHeightIn,
    coverSpineTextIncluded: pdfAssets.coverSpineTextIncluded,
    previewPdfUrl: undefined,
    previewPdfPageWidthIn: undefined,
    previewPdfPageHeightIn: undefined,
    printPdfUrl: pdfAssets.printPdfUrl,
    luluCoverPdfUrl: pdfAssets.luluCoverPdfUrl,
    luluCoverPdfPageWidthIn: pdfAssets.luluCoverPdfPageWidthIn,
    luluCoverPdfPageHeightIn: pdfAssets.luluCoverPdfPageHeightIn,
    luluCoverPdfSpineWidthIn: pdfAssets.luluCoverPdfSpineWidthIn,
    luluPrintPdfUrl: pdfAssets.luluPrintPdfUrl,
    luluPrintPdfPageWidthIn: pdfAssets.luluPrintPdfPageWidthIn,
    luluPrintPdfPageHeightIn: pdfAssets.luluPrintPdfPageHeightIn,
    luluPrintPdfPageCount: pdfAssets.luluPrintPdfPageCount,
    epubUrl: epubAssets.epubUrl,
    printPdfPageWidthIn: pdfAssets.printPdfPageWidthIn,
    printPdfPageHeightIn: pdfAssets.printPdfPageHeightIn,
    interiorTextSafeMarginIn: pdfAssets.interiorTextSafeMarginIn,
    previewImages: pdfAssets.previewImages,
    downloadableFilesArchivedAt: undefined,
    downloadableFilesArchiveReason: undefined,
  };

  const proofingReport = runStorycotPrintProofing(
    {
      ...input.project,
      assets: proofingAssets,
    },
    { strictForOrdering: input.buildMode === "finalize" }
  );

  const finalizedAt =
    input.buildMode === "finalize" &&
    proofingReport.orderabilityState === "order_ready"
      ? getNowIso()
      : undefined;

  const proofingProject = await db.bookProjects.update(input.id, {
    status: "proofing",
    currentStageLabel:
      input.buildMode === "finalize"
        ? "Finalizing the order package..."
        : getBookProjectStageLabel("proofing"),
    spreads: input.project.spreads,
    assets: {
      ...proofingAssets,
      exportVersion: nextProofVersion,
      finalExportVersion: finalizedAt
        ? nextProofVersion
        : input.project.assets.finalExportVersion,
      lastBuildMode: input.buildMode,
      orderabilityState: proofingReport.orderabilityState,
      finalizedAt,
      exportProfile: BOOK_SPEC.trimLabel,
      proofVersion: nextProofVersion,
      proofingPassed: proofingReport.passed,
      proofingChecks: proofingReport.checks,
      proofingWarnings: proofingReport.warnings,
      proofingErrors: proofingReport.errors,
    },
  });

  if (!proofingProject) return undefined;

  const readyAt = getNowIso();
  return db.bookProjects.update(input.id, {
    status: "ready",
    currentStageLabel: getBookProjectStageLabel("ready"),
    readyAt,
    assets: {
      ...proofingProject.assets,
    },
  });
}
