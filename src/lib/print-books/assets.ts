export function isInlineBookAssetUrl(url?: string): boolean {
  return typeof url === 'string' && url.startsWith('data:')
}

export function isDownloadableBookAssetUrl(url?: string): boolean {
  return typeof url === 'string' && url.length > 0 && !isInlineBookAssetUrl(url)
}
