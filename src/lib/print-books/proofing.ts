import type {
  BookOrderabilityState,
  BookProject,
  ProofingCheck,
} from "@/types/printBook";
import { STORYCOT_PRINT_REVIEW_SPEC } from "@/lib/print-books/printProducts";

export const STORYCOT_REVIEW_PRINT_SPEC = {
  ...STORYCOT_PRINT_REVIEW_SPEC,
} as const;

export interface ProofingReport {
  passed: boolean;
  warnings: string[];
  errors: string[];
  checks: ProofingCheck[];
  orderabilityState: BookOrderabilityState;
}

export function runStorycotPrintProofing(
  project: BookProject,
  options?: { strictForOrdering?: boolean }
): ProofingReport {
  const warnings: string[] = [];
  const errors: string[] = [];
  const checks: ProofingCheck[] = [];
  const strictForOrdering = options?.strictForOrdering ?? false;

  const addCheck = (check: ProofingCheck) => {
    checks.push(check);
    if (check.status === "fail") errors.push(check.detail);
    if (check.status === "warn") warnings.push(check.detail);
  };

  const pageCountValid =
    project.pageCount >= STORYCOT_REVIEW_PRINT_SPEC.minPageCount &&
    project.pageCount <= STORYCOT_REVIEW_PRINT_SPEC.maxPageCount &&
    project.pageCount % 2 === 0;
  if (!pageCountValid) {
    addCheck({
      key: "page_count",
      label: "Interior page count",
      status: "fail",
      detail: `Expected an even page count between ${STORYCOT_REVIEW_PRINT_SPEC.minPageCount} and ${STORYCOT_REVIEW_PRINT_SPEC.maxPageCount}, found ${project.pageCount}.`,
    });
  } else {
    addCheck({
      key: "page_count",
      label: "Interior page count",
      status: "pass",
      detail: `${project.pageCount} pages fits the dynamic Storycot review package.`,
    });
  }

  const expectedSpreadCount = project.pageCount / 2;
  if (project.spreadCount !== expectedSpreadCount) {
    addCheck({
      key: "spread_count",
      label: "Spread count",
      status: "fail",
      detail: `Expected ${expectedSpreadCount} spreads for ${project.pageCount} pages, found ${project.spreadCount}.`,
    });
  } else {
    addCheck({
      key: "spread_count",
      label: "Spread count",
      status: "pass",
      detail: `Spread count matches the ${project.pageCount}-page layout.`,
    });
  }

  if (project.trimSize !== "storycot-dynamic-square") {
    addCheck({
      key: "product_profile",
      label: "Selected print review profile",
      status: "fail",
      detail: `Book project trim profile must remain storycot-dynamic-square for ${STORYCOT_REVIEW_PRINT_SPEC.trimLabel}.`,
    });
  } else {
    addCheck({
      key: "product_profile",
      label: "Selected print review profile",
      status: "pass",
      detail: `Project is targeting ${STORYCOT_REVIEW_PRINT_SPEC.trimLabel}.`,
    });
  }

  if (project.spreads.length !== expectedSpreadCount) {
    addCheck({
      key: "stored_spreads",
      label: "Stored spreads",
      status: "fail",
      detail: `Expected ${expectedSpreadCount} stored spreads, found ${project.spreads.length}.`,
    });
  } else {
    addCheck({
      key: "stored_spreads",
      label: "Stored spreads",
      status: "pass",
      detail: `All ${project.spreads.length} spreads are stored on the project.`,
    });
  }

  if (!project.assets.coverImageUrl) {
    addCheck({
      key: "cover_art",
      label: "Cover artwork",
      status: "fail",
      detail: "Cover image asset is missing.",
    });
  } else {
    const coverArtStatus =
      project.assets.artMode === "placeholder"
        ? strictForOrdering
          ? "fail"
          : "warn"
        : project.assets.artMode === "mixed"
          ? strictForOrdering
            ? "fail"
            : "warn"
          : "pass";
    addCheck({
      key: "cover_art",
      label: "Cover artwork",
      status: coverArtStatus,
      detail:
        project.assets.artMode === "placeholder"
          ? strictForOrdering
            ? "Cover art is still using draft placeholder artwork and cannot be finalized for ordering."
            : "Cover art is still using draft placeholder artwork."
          : project.assets.artMode === "mixed"
            ? strictForOrdering
              ? "Cover art is mixed with draft placeholder artwork and cannot be finalized for ordering."
              : "Cover art mixes generated and placeholder artwork."
            : "Cover artwork is present.",
    });
  }

  if (!project.assets.coverPdfUrl) {
    addCheck({
      key: "cover_pdf",
      label: "Cover PDF export",
      status: "fail",
      detail: "Separate cover PDF is missing.",
    });
  } else {
    addCheck({
      key: "cover_pdf",
      label: "Cover PDF export",
      status: "pass",
      detail: "Separate cover PDF is present.",
    });
  }

  if (
    project.assets.coverPdfPageWidthIn &&
    project.assets.coverPdfPageHeightIn &&
    project.assets.coverPdfSpineWidthIn
  ) {
    const expectedCoverWidth = Number(
      (
        (STORYCOT_REVIEW_PRINT_SPEC.trimWidthIn +
          STORYCOT_REVIEW_PRINT_SPEC.bleedIn * 2) *
          2 +
        project.assets.coverPdfSpineWidthIn
      ).toFixed(3)
    );
    const expectedCoverHeight = Number(
      (
        STORYCOT_REVIEW_PRINT_SPEC.trimHeightIn +
        STORYCOT_REVIEW_PRINT_SPEC.bleedIn * 2
      ).toFixed(3)
    );
    const widthMatches =
      Math.abs(project.assets.coverPdfPageWidthIn - expectedCoverWidth) < 0.001;
    const heightMatches =
      Math.abs(project.assets.coverPdfPageHeightIn - expectedCoverHeight) <
      0.001;
    addCheck({
      key: "cover_geometry",
      label: "Cover PDF geometry",
      status: widthMatches && heightMatches ? "pass" : "fail",
      detail:
        widthMatches && heightMatches
          ? `Cover PDF page size matches Storycot geometry at ${expectedCoverWidth}" x ${expectedCoverHeight}".`
          : `Cover PDF page size must be ${expectedCoverWidth}" x ${expectedCoverHeight}", found ${project.assets.coverPdfPageWidthIn}" x ${project.assets.coverPdfPageHeightIn}".`,
    });
  }

  const spreadsMissingImages = project.spreads
    .filter((spread) => !spread.imageUrl)
    .map((spread) => spread.sequence);
  if (spreadsMissingImages.length > 0) {
    addCheck({
      key: "spread_art",
      label: "Interior artwork coverage",
      status: "fail",
      detail: `Spread images are missing for spreads: ${spreadsMissingImages.join(", ")}.`,
    });
  } else {
    const spreadArtStatus =
      project.assets.artMode === "placeholder" ||
      project.assets.artMode === "mixed"
        ? strictForOrdering
          ? "fail"
          : "warn"
        : "pass";
    addCheck({
      key: "spread_art",
      label: "Interior artwork coverage",
      status: spreadArtStatus,
      detail:
        project.assets.artMode === "placeholder"
          ? strictForOrdering
            ? "All spreads have artwork, but they are still using draft placeholder illustrations and cannot be finalized for ordering."
            : "All spreads have artwork, but they are still using draft placeholder illustrations."
          : project.assets.artMode === "mixed"
            ? strictForOrdering
              ? "All spreads have artwork, but the book mixes generated and placeholder illustrations and cannot be finalized for ordering."
              : "All spreads have artwork, but the book mixes generated and placeholder illustrations."
            : "All spreads have artwork attached.",
    });
  }

  if (!project.assets.printPdfUrl) {
    addCheck({
      key: "print_pdf",
      label: "Interior print PDF export",
      status: "fail",
      detail: "Print PDF is missing.",
    });
  } else {
    addCheck({
      key: "print_pdf",
      label: "Interior print PDF export",
      status: "pass",
      detail: "Interior print PDF is present.",
    });
  }

  if (
    project.assets.printPdfPageWidthIn &&
    project.assets.printPdfPageHeightIn
  ) {
    const expectedPrintWidth = Number(
      (
        STORYCOT_REVIEW_PRINT_SPEC.trimWidthIn +
        STORYCOT_REVIEW_PRINT_SPEC.bleedIn * 2
      ).toFixed(3)
    );
    const expectedPrintHeight = Number(
      (
        STORYCOT_REVIEW_PRINT_SPEC.trimHeightIn +
        STORYCOT_REVIEW_PRINT_SPEC.bleedIn * 2
      ).toFixed(3)
    );
    const widthMatches =
      Math.abs(project.assets.printPdfPageWidthIn - expectedPrintWidth) < 0.001;
    const heightMatches =
      Math.abs(project.assets.printPdfPageHeightIn - expectedPrintHeight) <
      0.001;
    addCheck({
      key: "print_geometry",
      label: "Interior print PDF geometry",
      status: widthMatches && heightMatches ? "pass" : "fail",
      detail:
        widthMatches && heightMatches
          ? `Interior print pages match Storycot full-bleed geometry at ${expectedPrintWidth}" x ${expectedPrintHeight}".`
          : `Interior print pages must be ${expectedPrintWidth}" x ${expectedPrintHeight}", found ${project.assets.printPdfPageWidthIn}" x ${project.assets.printPdfPageHeightIn}".`,
    });
  }

  if (project.assets.interiorTextSafeMarginIn) {
    const textMarginPass =
      project.assets.interiorTextSafeMarginIn >=
      STORYCOT_REVIEW_PRINT_SPEC.fullBleedTextSafeMarginIn;
    addCheck({
      key: "text_safe_margin",
      label: "Interior text safe margin",
      status: textMarginPass ? "pass" : "fail",
      detail: textMarginPass
        ? `Interior text stays within the ${STORYCOT_REVIEW_PRINT_SPEC.fullBleedTextSafeMarginIn}" full-bleed safe margin.`
        : `Interior text safe margin must be at least ${STORYCOT_REVIEW_PRINT_SPEC.fullBleedTextSafeMarginIn}" from the page edge, found ${project.assets.interiorTextSafeMarginIn}".`,
    });
  }

  if (
    project.assets.previewImages &&
    project.assets.previewImages.length < project.spreads.length
  ) {
    addCheck({
      key: "preview_images",
      label: "Preview image coverage",
      status: "warn",
      detail: "Preview image list is shorter than the spread count.",
    });
  } else if (
    project.assets.previewImages &&
    project.assets.previewImages.length > 0
  ) {
    addCheck({
      key: "preview_images",
      label: "Preview image coverage",
      status: "pass",
      detail: `Preview image list covers ${project.assets.previewImages.length} spreads.`,
    });
  }

  warnings.push(
    `Renderer targets ${STORYCOT_REVIEW_PRINT_SPEC.trimLabel} with ${STORYCOT_REVIEW_PRINT_SPEC.bleedIn}" bleed, ${STORYCOT_REVIEW_PRINT_SPEC.safetyMarginIn}" trim safety, and ${STORYCOT_REVIEW_PRINT_SPEC.fullBleedTextSafeMarginIn}" full-bleed text safety.`
  );

  warnings.push(
    "Interior print pages are rendered as single pages with split spread artwork, but every project still needs a manual print preview check before ordering."
  );

  if (project.assets.coverPdfUrl) {
    warnings.push(
      "Cover export is generated as a separate one-piece PDF with back cover, spine, and front cover layout."
    );
  }

  warnings.push(
    "Retail distribution metadata is still pending. ISBN and barcode placement should be finalized separately if you intend to distribute beyond direct print ordering."
  );

  if (
    project.assets.coverPdfSpineSource === "storycot_estimate" &&
    project.assets.coverPdfSpineWidthIn
  ) {
    addCheck({
      key: "spine_width",
      label: "Cover spine width",
      status: "pass",
      detail: `Cover spine width uses Storycot's current estimate at ${project.assets.coverPdfSpineWidthIn}".`,
    });
  } else if (project.assets.coverPdfSpineWidthIn) {
    addCheck({
      key: "spine_width",
      label: "Cover spine width",
      status: "pass",
      detail: `Cover spine width is explicitly configured at ${project.assets.coverPdfSpineWidthIn}".`,
    });
  }

  if (typeof project.assets.coverSpineTextIncluded === "boolean") {
    const shouldHaveSpineText =
      project.pageCount >= STORYCOT_REVIEW_PRINT_SPEC.spineTextMinPageCount;
    const isValid =
      shouldHaveSpineText || !project.assets.coverSpineTextIncluded;
    addCheck({
      key: "spine_text",
      label: "Spine text usage",
      status: isValid ? "pass" : "fail",
      detail: isValid
        ? shouldHaveSpineText
          ? "Spine text is allowed for this page count."
          : `Spine text is correctly omitted under ${STORYCOT_REVIEW_PRINT_SPEC.spineTextMinPageCount} pages.`
        : `Spine text must be omitted under ${STORYCOT_REVIEW_PRINT_SPEC.spineTextMinPageCount} pages.`,
    });
  }

  const hasDownloadableExports = Boolean(
    project.assets.printPdfUrl && project.assets.coverPdfUrl
  );
  const passed = errors.length === 0;
  const orderabilityState: BookOrderabilityState = !hasDownloadableExports
    ? "draft_only"
    : passed && strictForOrdering
      ? "order_ready"
      : "export_ready";

  return {
    passed,
    warnings,
    errors,
    checks,
    orderabilityState,
  };
}
