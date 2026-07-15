const DEFAULT_CASEWRAP_SPINE_WIDTH_IN = 0.25
const ASSUMED_CASEWRAP_SPINE_PER_PAGE_IN = 0.0025

function parsePositiveNumber(value?: string): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return parsed
}

export function getConfiguredLuluCoverSpineWidthIn(): number | undefined {
  return parsePositiveNumber(process.env.LULU_COVER_SPINE_WIDTH_IN)
}

export function hasConfiguredLuluCoverSpineWidth(): boolean {
  return typeof getConfiguredLuluCoverSpineWidthIn() === 'number'
}

export function getAssumedLuluCoverSpineWidthIn(pageCount: number): number {
  const estimated = Number((pageCount * ASSUMED_CASEWRAP_SPINE_PER_PAGE_IN).toFixed(3))
  return estimated > 0 ? estimated : DEFAULT_CASEWRAP_SPINE_WIDTH_IN
}

export function getLuluCoverSpineWidth(pageCount: number): {
  widthIn: number
  source: 'configured' | 'assumed'
} {
  const configured = getConfiguredLuluCoverSpineWidthIn()
  if (configured) {
    return { widthIn: configured, source: 'configured' }
  }

  return {
    widthIn: getAssumedLuluCoverSpineWidthIn(pageCount),
    source: 'assumed',
  }
}
