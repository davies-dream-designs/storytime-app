export const LULU_CASEWRAP_CHILDRENS_PROFILE = {
  key: 'lulu-square-casewrap-premium-color-80-white',
  trimLabel: 'Lulu Square 8.5x8.5 Hardcover Casewrap / Premium Color / 80# White',
  trimWidthIn: 8.5,
  trimHeightIn: 8.5,
  bleedIn: 0.125,
  safetyMarginIn: 0.5,
  fullBleedTextSafeMarginIn: 0.625,
  gutterMarginIn: 0,
  minImagePpi: 300,
  maxImagePpi: 600,
  minPageCount: 24,
  maxPageCount: 800,
  targetPageCount: 32,
  targetSpreadCount: 16,
  binding: 'hardcover-casewrap',
  paper: '80# white',
  color: 'premium-color',
  coverFinish: 'gloss-laminated',
  spineTextMinPageCount: 100,
} as const

const HARD_COVER_SPINE_WIDTH_TABLE = [
  { min: 24, max: 84, widthIn: 0.25 },
  { min: 85, max: 140, widthIn: 0.5 },
  { min: 141, max: 168, widthIn: 0.625 },
  { min: 169, max: 194, widthIn: 0.688 },
  { min: 195, max: 222, widthIn: 0.75 },
  { min: 223, max: 250, widthIn: 0.813 },
  { min: 251, max: 278, widthIn: 0.875 },
  { min: 279, max: 306, widthIn: 0.938 },
  { min: 307, max: 334, widthIn: 1 },
  { min: 335, max: 360, widthIn: 1.063 },
  { min: 361, max: 388, widthIn: 1.125 },
  { min: 389, max: 416, widthIn: 1.188 },
  { min: 417, max: 444, widthIn: 1.25 },
  { min: 445, max: 472, widthIn: 1.313 },
  { min: 473, max: 500, widthIn: 1.375 },
  { min: 501, max: 528, widthIn: 1.438 },
  { min: 529, max: 556, widthIn: 1.5 },
  { min: 557, max: 582, widthIn: 1.563 },
  { min: 583, max: 610, widthIn: 1.625 },
  { min: 611, max: 638, widthIn: 1.688 },
  { min: 639, max: 666, widthIn: 1.75 },
  { min: 667, max: 694, widthIn: 1.813 },
  { min: 695, max: 722, widthIn: 1.875 },
  { min: 723, max: 750, widthIn: 1.938 },
  { min: 751, max: 778, widthIn: 2 },
  { min: 779, max: 799, widthIn: 2.063 },
  { min: 800, max: 800, widthIn: 2.125 },
] as const

function parsePositiveNumber(value?: string): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return parsed
}

export function getConfiguredLuluCoverSpineWidthIn(): number | undefined {
  return parsePositiveNumber(process.env.LULU_COVER_SPINE_WIDTH_IN)
}

export function getLuluHardcoverCasewrapSpineWidthFromTable(pageCount: number): number {
  const match = HARD_COVER_SPINE_WIDTH_TABLE.find((entry) => pageCount >= entry.min && pageCount <= entry.max)
  if (!match) {
    throw new Error(
      `Page count ${pageCount} is outside Lulu hardcover casewrap limits (${LULU_CASEWRAP_CHILDRENS_PROFILE.minPageCount}-${LULU_CASEWRAP_CHILDRENS_PROFILE.maxPageCount}).`
    )
  }

  return match.widthIn
}

export function getLuluCoverSpineWidth(pageCount: number): {
  widthIn: number
  source: 'configured' | 'lulu_table'
} {
  const configured = getConfiguredLuluCoverSpineWidthIn()
  if (configured) {
    return { widthIn: configured, source: 'configured' }
  }

  return {
    widthIn: getLuluHardcoverCasewrapSpineWidthFromTable(pageCount),
    source: 'lulu_table',
  }
}
