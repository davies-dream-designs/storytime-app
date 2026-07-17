import { describe, expect, it } from 'vitest'
import { isDownloadableBookAssetUrl, isInlineBookAssetUrl } from '@/lib/print-books/assets'

describe('book asset url helpers', () => {
  it('detects inline data urls', () => {
    expect(isInlineBookAssetUrl('data:application/pdf;base64,abc')).toBe(true)
    expect(isDownloadableBookAssetUrl('data:application/pdf;base64,abc')).toBe(false)
  })

  it('detects stored asset urls', () => {
    expect(isInlineBookAssetUrl('https://example.com/book.pdf')).toBe(false)
    expect(isDownloadableBookAssetUrl('https://example.com/book.pdf')).toBe(true)
  })
})
