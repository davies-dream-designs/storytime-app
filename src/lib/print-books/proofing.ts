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
    'Print PDF is now single-page and bleed-aware, but the current spread model is conceptual and should still be visually reviewed for left/right page flow.'
  )

  warnings.push(
    'Lulu distribution still requires a separate one-piece cover PDF with template-specific spine width; the current build stores cover art, not a final cover PDF.'
  )

  return {
    passed: errors.length === 0,
    warnings,
    errors,
  }
}
