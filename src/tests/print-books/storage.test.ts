import { beforeEach, describe, expect, it } from 'vitest'

describe('storeBookAsset', () => {
  beforeEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN
    delete process.env.BLOB_STORE_ID
    delete process.env.VERCEL_OIDC_TOKEN
  })

  it('falls back to a data URL when blob storage is not configured', async () => {
    const { storeBookAsset } = await import('@/lib/print-books/storage')
    const url = await storeBookAsset({
      pathname: 'books/book-1/cover.svg',
      body: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      contentType: 'image/svg+xml',
    })

    expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true)
  })
})
