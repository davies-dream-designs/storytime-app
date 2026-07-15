import type { BookProject, ProofingCheck, BookOrderabilityState } from '@/types/printBook'

export const LULU_SQUARE_HARDCOVER_SPEC = {
  trimLabel: 'Lulu Square Hardcover 8.5x8.5',
  trimWidthIn: 8.5,
  trimHeightIn: 8.5,
  bleedIn: 0.125,
  safetyMarginIn: 0.5,
  gutterMarginIn: 0.2,
  minImagePpi: 300,
  maxImagePpi: 600,
  targetPageCount: 32,
  targetSpreadCount: 16,
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
    `Renderer targets ${LULU_SQUARE_HARDCOVER_SPEC.trimLabel} with ${LULU_SQUARE_HARDCOVER_SPEC.bleedIn}" bleed and ${LULU_SQUARE_HARDCOVER_SPEC.safetyMarginIn}" safety margins.`
  )

  warnings.push(
    'Interior print pages are rendered as single pages with split spread artwork, but every project still needs a manual Lulu preview check before ordering.'
  )

  if (project.assets.coverPdfUrl) {
    warnings.push('Cover export is generated as a separate one-piece PDF with back cover, spine, and front cover layout.')
  }

  if (project.assets.coverPdfSpineSource === 'assumed' && project.assets.coverPdfSpineWidthIn) {
    addCheck({
      key: 'spine_width',
      label: 'Cover spine width',
      status: strictForOrdering ? 'fail' : 'warn',
      detail: strictForOrdering
        ? `Cover spine width is still assumed at ${project.assets.coverPdfSpineWidthIn}" and must be configured from a Lulu template before finalizing for order.`
        : `Cover spine width is assumed from page count at ${project.assets.coverPdfSpineWidthIn}" and should be checked against Lulu's template before ordering.`,
    })
  } else if (project.assets.coverPdfSpineWidthIn) {
    addCheck({
      key: 'spine_width',
      label: 'Cover spine width',
      status: 'pass',
      detail: `Cover spine width is explicitly configured at ${project.assets.coverPdfSpineWidthIn}".`,
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
