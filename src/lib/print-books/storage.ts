import { put } from '@vercel/blob'

function hasBlobConfig(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)
  )
}

export function isBookAssetStorageConfigured(): boolean {
  return hasBlobConfig()
}

function bufferToDataUrl(buffer: Buffer, contentType: string): string {
  return `data:${contentType};base64,${buffer.toString('base64')}`
}

export async function storeBookAsset(input: {
  pathname: string
  body: string | Buffer | ArrayBuffer
  contentType: string
}): Promise<string> {
  const { pathname, body, contentType } = input

  if (!isBookAssetStorageConfigured()) {
    if (typeof body === 'string') {
      return bufferToDataUrl(Buffer.from(body, 'utf8'), contentType)
    }

    if (body instanceof ArrayBuffer) {
      return bufferToDataUrl(Buffer.from(body), contentType)
    }

    return bufferToDataUrl(body, contentType)
  }

  const blob = await put(pathname, body, {
    access: 'public',
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType,
  })

  return blob.url
}
