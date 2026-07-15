import { put } from '@vercel/blob'

type ResolvedBlobConfig =
  | { kind: 'token'; token: string }
  | { kind: 'oidc'; storeId: string; oidcToken: string }
  | null

function getEnvironmentScopedReadWriteToken(): string | undefined {
  const vercelEnv = (process.env.VERCEL_ENV || '').toLowerCase()

  if (vercelEnv === 'preview') {
    return process.env.PREVIEW_READ_WRITE_TOKEN
  }

  if (vercelEnv === 'production') {
    return process.env.PROD_READ_WRITE_TOKEN
  }

  return process.env.PREVIEW_READ_WRITE_TOKEN || process.env.PROD_READ_WRITE_TOKEN
}

function getEnvironmentScopedStoreId(): string | undefined {
  const vercelEnv = (process.env.VERCEL_ENV || '').toLowerCase()

  if (vercelEnv === 'preview') {
    return process.env.PREVIEW_STORE_ID
  }

  if (vercelEnv === 'production') {
    return process.env.PROD_STORE_ID
  }

  return process.env.PREVIEW_STORE_ID || process.env.PROD_STORE_ID
}

function resolveBlobConfig(): ResolvedBlobConfig {
  const readWriteToken = process.env.BLOB_READ_WRITE_TOKEN || getEnvironmentScopedReadWriteToken()
  if (readWriteToken) {
    return { kind: 'token', token: readWriteToken }
  }

  const storeId = process.env.BLOB_STORE_ID || getEnvironmentScopedStoreId()
  const oidcToken = process.env.VERCEL_OIDC_TOKEN
  if (storeId && oidcToken) {
    return { kind: 'oidc', storeId, oidcToken }
  }

  return null
}

function hasBlobConfig(): boolean {
  return Boolean(resolveBlobConfig())
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
  const blobConfig = resolveBlobConfig()

  if (!blobConfig) {
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
    ...(blobConfig.kind === 'token'
      ? { token: blobConfig.token }
      : { storeId: blobConfig.storeId, token: blobConfig.oidcToken }),
  })

  return blob.url
}
