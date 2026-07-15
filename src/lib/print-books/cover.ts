const DEFAULT_CASEWRAP_SPINE_WIDTH_IN = 0.25

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

export function getLuluCoverSpineWidthIn(): number {
  return getConfiguredLuluCoverSpineWidthIn() ?? DEFAULT_CASEWRAP_SPINE_WIDTH_IN
}
