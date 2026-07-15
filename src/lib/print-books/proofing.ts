import type { BookProject } from '@/types/printBook'

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
}

export function runLuluProofing(project: BookProject): ProofingReport {
  const warnings: string[] = []
  const errors: string[] = []

  if (project.pageCount !== LULU_SQUARE_HARDCOVER_SPEC.targetPageCount) {
    errors.push(`Expected ${LULU_SQUARE_HARDCOVER_SPEC.targetPageCount} pages, found ${project.pageCount}.`)
  }

  if (project.spreadCount !== LULU_SQUARE_HARDCOVER_SPEC.targetSpreadCount) {
    errors.push(`Expected ${LULU_SQUARE_HARDCOVER_SPEC.targetSpreadCount} spreads, found ${project.spreadCount}.`)
  }

  if (project.spreads.length !== LULU_SQUARE_HARDCOVER_SPEC.targetSpreadCount) {
    errors.push(`Expected ${LULU_SQUARE_HARDCOVER_SPEC.targetSpreadCount} stored spreads, found ${project.spreads.length}.`)
  }

  if (!project.assets.coverImageUrl) {
    errors.push('Cover image asset is missing.')
  }

  if (!project.assets.coverPdfUrl) {
    errors.push('Separate Lulu cover PDF is missing.')
  }

  const spreadsMissingImages = project.spreads.filter((spread) => !spread.imageUrl).map((spread) => spread.sequence)
  if (spreadsMissingImages.length > 0) {
    errors.push(`Spread images are missing for spreads: ${spreadsMissingImages.join(', ')}.`)
  }

  if (!project.assets.previewPdfUrl) {
    errors.push('Preview PDF is missing.')
  }

  if (!project.assets.printPdfUrl) {
    errors.push('Print PDF is missing.')
  }

  if (project.assets.previewImages && project.assets.previewImages.length < project.spreads.length) {
    warnings.push('Preview image list is shorter than the spread count.')
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
    warnings.push(
      `Cover spine width is assumed from page count at ${project.assets.coverPdfSpineWidthIn}" and should be checked against Lulu's template before ordering.`
    )
  }

  return {
    passed: errors.length === 0,
    warnings,
    errors,
  }
}
