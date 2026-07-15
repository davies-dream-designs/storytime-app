import type { BookOrderabilityState, BookProject, ProofingCheck } from '@/types/printBook'
import { LULU_CASEWRAP_CHILDRENS_PROFILE } from '@/lib/print-books/lulu'

export const LULU_SQUARE_HARDCOVER_SPEC = {
  ...LULU_CASEWRAP_CHILDRENS_PROFILE,
} as const

export interface ProofingReport {
  passed: boolean
  warnings: string[]
  errors: string[]
  checks: ProofingCheck[]
  orderabilityState: BookOrderabilityState
}

export function runLuluProofing(project: BookProject, options?: { strictForOrdering?: boolean }): ProofingReport {
  const warnings: string[] = []
  const errors: string[] = []
  const checks: ProofingCheck[] = []
  const strictForOrdering = options?.strictForOrdering ?? false

  const addCheck = (check: ProofingCheck) => {
    checks.push(check)
    if (check.status === 'fail') errors.push(check.detail)
    if (check.status === 'warn') warnings.push(check.detail)
  }

  if (project.pageCount !== LULU_SQUARE_HARDCOVER_SPEC.targetPageCount) {
    addCheck({
      key: 'page_count',
      label: 'Interior page count',
      status: 'fail',
      detail: `Expected ${LULU_SQUARE_HARDCOVER_SPEC.targetPageCount} pages, found ${project.pageCount}.`,
    })
  } else {
    addCheck({
      key: 'page_count',
      label: 'Interior page count',
      status: 'pass',
      detail: `Page count matches the ${LULU_SQUARE_HARDCOVER_SPEC.targetPageCount}-page hardcover target.`,
    })
  }

  if (project.spreadCount !== LULU_SQUARE_HARDCOVER_SPEC.targetSpreadCount) {
    addCheck({
      key: 'spread_count',
      label: 'Spread count',
      status: 'fail',
      detail: `Expected ${LULU_SQUARE_HARDCOVER_SPEC.targetSpreadCount} spreads, found ${project.spreadCount}.`,
    })
  } else {
    addCheck({
      key: 'spread_count',
      label: 'Spread count',
      status: 'pass',
      detail: `Spread count matches the ${LULU_SQUARE_HARDCOVER_SPEC.targetSpreadCount}-spread layout.`,
    })
  }

  if (project.trimSize !== 'lulu-hardcover-32') {
    addCheck({
      key: 'product_profile',
      label: 'Selected Lulu product profile',
      status: 'fail',
      detail: `Book project trim profile must remain lulu-hardcover-32 for ${LULU_SQUARE_HARDCOVER_SPEC.trimLabel}.`,
    })
  } else {
    addCheck({
      key: 'product_profile',
      label: 'Selected Lulu product profile',
      status: 'pass',
      detail: `Project is targeting ${LULU_SQUARE_HARDCOVER_SPEC.trimLabel}.`,
    })
  }

  if (project.spreads.length !== LULU_SQUARE_HARDCOVER_SPEC.targetSpreadCount) {
    addCheck({
      key: 'stored_spreads',
      label: 'Stored spreads',
      status: 'fail',
      detail: `Expected ${LULU_SQUARE_HARDCOVER_SPEC.targetSpreadCount} stored spreads, found ${project.spreads.length}.`,
    })
  } else {
    addCheck({
      key: 'stored_spreads',
      label: 'Stored spreads',
      status: 'pass',
      detail: `All ${project.spreads.length} spreads are stored on the project.`,
    })
  }

  if (!project.assets.coverImageUrl) {
    addCheck({
      key: 'cover_art',
      label: 'Cover artwork',
      status: 'fail',
      detail: 'Cover image asset is missing.',
    })
  } else {
    const coverArtStatus =
      project.assets.artMode === 'placeholder'
        ? (strictForOrdering ? 'fail' : 'warn')
        : project.assets.artMode === 'mixed'
          ? (strictForOrdering ? 'fail' : 'warn')
          : 'pass'
    addCheck({
      key: 'cover_art',
      label: 'Cover artwork',
      status: coverArtStatus,
      detail:
        project.assets.artMode === 'placeholder'
          ? strictForOrdering
            ? 'Cover art is still using draft placeholder artwork and cannot be finalized for ordering.'
            : 'Cover art is still using draft placeholder artwork.'
          : project.assets.artMode === 'mixed'
            ? strictForOrdering
              ? 'Cover art is mixed with draft placeholder artwork and cannot be finalized for ordering.'
              : 'Cover art mixes generated and placeholder artwork.'
            : 'Cover artwork is present.',
    })
  }

  if (!project.assets.coverPdfUrl) {
    addCheck({
      key: 'cover_pdf',
      label: 'Cover PDF export',
      status: 'fail',
      detail: 'Separate Lulu cover PDF is missing.',
    })
  } else {
    addCheck({
      key: 'cover_pdf',
      label: 'Cover PDF export',
      status: 'pass',
      detail: 'Separate Lulu cover PDF is present.',
    })
  }

  if (
    project.assets.coverPdfPageWidthIn &&
    project.assets.coverPdfPageHeightIn &&
    project.assets.coverPdfSpineWidthIn
  ) {
    const expectedCoverWidth = Number(
      (
        (LULU_SQUARE_HARDCOVER_SPEC.trimWidthIn + LULU_SQUARE_HARDCOVER_SPEC.bleedIn * 2) * 2 +
        project.assets.coverPdfSpineWidthIn
      ).toFixed(3)
    )
    const expectedCoverHeight = Number(
      (LULU_SQUARE_HARDCOVER_SPEC.trimHeightIn + LULU_SQUARE_HARDCOVER_SPEC.bleedIn * 2).toFixed(3)
    )
    const widthMatches = Math.abs(project.assets.coverPdfPageWidthIn - expectedCoverWidth) < 0.001
    const heightMatches = Math.abs(project.assets.coverPdfPageHeightIn - expectedCoverHeight) < 0.001
    addCheck({
      key: 'cover_geometry',
      label: 'Cover PDF geometry',
      status: widthMatches && heightMatches ? 'pass' : 'fail',
      detail: widthMatches && heightMatches
        ? `Cover PDF page size matches Lulu geometry at ${expectedCoverWidth}" x ${expectedCoverHeight}".`
        : `Cover PDF page size must be ${expectedCoverWidth}" x ${expectedCoverHeight}", found ${project.assets.coverPdfPageWidthIn}" x ${project.assets.coverPdfPageHeightIn}".`,
    })
  }

  const spreadsMissingImages = project.spreads.filter((spread) => !spread.imageUrl).map((spread) => spread.sequence)
  if (spreadsMissingImages.length > 0) {
    addCheck({
      key: 'spread_art',
      label: 'Interior artwork coverage',
      status: 'fail',
      detail: `Spread images are missing for spreads: ${spreadsMissingImages.join(', ')}.`,
    })
  } else {
    const spreadArtStatus =
      project.assets.artMode === 'placeholder' || project.assets.artMode === 'mixed'
        ? (strictForOrdering ? 'fail' : 'warn')
        : 'pass'
    addCheck({
      key: 'spread_art',
      label: 'Interior artwork coverage',
      status: spreadArtStatus,
      detail:
        project.assets.artMode === 'placeholder'
          ? strictForOrdering
            ? 'All spreads have artwork, but they are still using draft placeholder illustrations and cannot be finalized for ordering.'
            : 'All spreads have artwork, but they are still using draft placeholder illustrations.'
          : project.assets.artMode === 'mixed'
            ? strictForOrdering
              ? 'All spreads have artwork, but the book mixes generated and placeholder illustrations and cannot be finalized for ordering.'
              : 'All spreads have artwork, but the book mixes generated and placeholder illustrations.'
            : 'All spreads have artwork attached.',
    })
  }

  if (!project.assets.previewPdfUrl) {
    addCheck({
      key: 'preview_pdf',
      label: 'Preview PDF export',
      status: 'fail',
      detail: 'Preview PDF is missing.',
    })
  } else {
    addCheck({
      key: 'preview_pdf',
      label: 'Preview PDF export',
      status: 'pass',
      detail: 'Preview PDF is present.',
    })
  }

  if (project.assets.previewPdfPageWidthIn && project.assets.previewPdfPageHeightIn) {
    const widthMatches = Math.abs(project.assets.previewPdfPageWidthIn - LULU_SQUARE_HARDCOVER_SPEC.trimWidthIn) < 0.001
    const heightMatches = Math.abs(project.assets.previewPdfPageHeightIn - LULU_SQUARE_HARDCOVER_SPEC.trimHeightIn) < 0.001
    addCheck({
      key: 'preview_geometry',
      label: 'Preview PDF geometry',
      status: widthMatches && heightMatches ? 'pass' : 'fail',
      detail: widthMatches && heightMatches
        ? `Preview PDF pages match the trim size at ${LULU_SQUARE_HARDCOVER_SPEC.trimWidthIn}" x ${LULU_SQUARE_HARDCOVER_SPEC.trimHeightIn}".`
        : `Preview PDF must match the trim size at ${LULU_SQUARE_HARDCOVER_SPEC.trimWidthIn}" x ${LULU_SQUARE_HARDCOVER_SPEC.trimHeightIn}", found ${project.assets.previewPdfPageWidthIn}" x ${project.assets.previewPdfPageHeightIn}".`,
    })
  }

  if (!project.assets.printPdfUrl) {
    addCheck({
      key: 'print_pdf',
      label: 'Interior print PDF export',
      status: 'fail',
      detail: 'Print PDF is missing.',
    })
  } else {
    addCheck({
      key: 'print_pdf',
      label: 'Interior print PDF export',
      status: 'pass',
      detail: 'Interior print PDF is present.',
    })
  }

  if (project.assets.printPdfPageWidthIn && project.assets.printPdfPageHeightIn) {
    const expectedPrintWidth = Number(
      (LULU_SQUARE_HARDCOVER_SPEC.trimWidthIn + LULU_SQUARE_HARDCOVER_SPEC.bleedIn * 2).toFixed(3)
    )
    const expectedPrintHeight = Number(
      (LULU_SQUARE_HARDCOVER_SPEC.trimHeightIn + LULU_SQUARE_HARDCOVER_SPEC.bleedIn * 2).toFixed(3)
    )
    const widthMatches = Math.abs(project.assets.printPdfPageWidthIn - expectedPrintWidth) < 0.001
    const heightMatches = Math.abs(project.assets.printPdfPageHeightIn - expectedPrintHeight) < 0.001
    addCheck({
      key: 'print_geometry',
      label: 'Interior print PDF geometry',
      status: widthMatches && heightMatches ? 'pass' : 'fail',
      detail: widthMatches && heightMatches
        ? `Interior print pages match Lulu full-bleed geometry at ${expectedPrintWidth}" x ${expectedPrintHeight}".`
        : `Interior print pages must be ${expectedPrintWidth}" x ${expectedPrintHeight}", found ${project.assets.printPdfPageWidthIn}" x ${project.assets.printPdfPageHeightIn}".`,
    })
  }

  if (project.assets.interiorTextSafeMarginIn) {
    const textMarginPass = project.assets.interiorTextSafeMarginIn >= LULU_SQUARE_HARDCOVER_SPEC.fullBleedTextSafeMarginIn
    addCheck({
      key: 'text_safe_margin',
      label: 'Interior text safe margin',
      status: textMarginPass ? 'pass' : 'fail',
      detail: textMarginPass
        ? `Interior text stays within the ${LULU_SQUARE_HARDCOVER_SPEC.fullBleedTextSafeMarginIn}" full-bleed safe margin.`
        : `Interior text safe margin must be at least ${LULU_SQUARE_HARDCOVER_SPEC.fullBleedTextSafeMarginIn}" from the page edge, found ${project.assets.interiorTextSafeMarginIn}".`,
    })
  }

  if (project.assets.previewImages && project.assets.previewImages.length < project.spreads.length) {
    addCheck({
      key: 'preview_images',
      label: 'Preview image coverage',
      status: 'warn',
      detail: 'Preview image list is shorter than the spread count.',
    })
  } else if (project.assets.previewImages && project.assets.previewImages.length > 0) {
    addCheck({
      key: 'preview_images',
      label: 'Preview image coverage',
      status: 'pass',
      detail: `Preview image list covers ${project.assets.previewImages.length} spreads.`,
    })
  }

  warnings.push(
    `Renderer targets ${LULU_SQUARE_HARDCOVER_SPEC.trimLabel} with ${LULU_SQUARE_HARDCOVER_SPEC.bleedIn}" bleed, ${LULU_SQUARE_HARDCOVER_SPEC.safetyMarginIn}" trim safety, and ${LULU_SQUARE_HARDCOVER_SPEC.fullBleedTextSafeMarginIn}" full-bleed text safety.`
  )

  warnings.push(
    'Interior print pages are rendered as single pages with split spread artwork, but every project still needs a manual Lulu preview check before ordering.'
  )

  if (project.assets.coverPdfUrl) {
    warnings.push('Cover export is generated as a separate one-piece PDF with back cover, spine, and front cover layout.')
  }

  warnings.push('Retail distribution metadata is still pending. ISBN and barcode placement should be finalized separately if you intend to distribute beyond direct print ordering.')

  if (project.assets.coverPdfSpineSource === 'lulu_table' && project.assets.coverPdfSpineWidthIn) {
    addCheck({
      key: 'spine_width',
      label: 'Cover spine width',
      status: 'pass',
      detail: `Cover spine width matches Lulu's hardcover table at ${project.assets.coverPdfSpineWidthIn}".`,
    })
  } else if (project.assets.coverPdfSpineWidthIn) {
    addCheck({
      key: 'spine_width',
      label: 'Cover spine width',
      status: 'pass',
      detail: `Cover spine width is explicitly configured at ${project.assets.coverPdfSpineWidthIn}".`,
    })
  }

  if (typeof project.assets.coverSpineTextIncluded === 'boolean') {
    const shouldHaveSpineText = project.pageCount >= LULU_SQUARE_HARDCOVER_SPEC.spineTextMinPageCount
    const isValid = shouldHaveSpineText || !project.assets.coverSpineTextIncluded
    addCheck({
      key: 'spine_text',
      label: 'Spine text usage',
      status: isValid ? 'pass' : 'fail',
      detail: isValid
        ? shouldHaveSpineText
          ? 'Spine text is allowed for this page count.'
          : `Spine text is correctly omitted under ${LULU_SQUARE_HARDCOVER_SPEC.spineTextMinPageCount} pages.`
        : `Spine text must be omitted under ${LULU_SQUARE_HARDCOVER_SPEC.spineTextMinPageCount} pages.`,
    })
  }

  const hasDownloadableExports = Boolean(project.assets.previewPdfUrl && project.assets.printPdfUrl && project.assets.coverPdfUrl)
  const passed = errors.length === 0
  const orderabilityState: BookOrderabilityState = !hasDownloadableExports
    ? 'draft_only'
    : passed && strictForOrdering
      ? 'order_ready'
      : 'export_ready'

  return {
    passed,
    warnings,
    errors,
    checks,
    orderabilityState,
  }
}
