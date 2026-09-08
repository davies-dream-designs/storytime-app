import { del, get, list, put } from "@vercel/blob";
import type { BookProject } from "@/types/printBook";

type ResolvedBlobConfig =
  | { kind: "token"; token: string }
  | { kind: "oidc"; storeId: string; oidcToken: string }
  | null;

function getEnvironmentScopedReadWriteToken(): string | undefined {
  const vercelEnv = (process.env.VERCEL_ENV || "").toLowerCase();

  if (vercelEnv === "preview") {
    return process.env.PREVIEW_READ_WRITE_TOKEN;
  }

  if (vercelEnv === "production") {
    return process.env.PROD_READ_WRITE_TOKEN;
  }

  return (
    process.env.PREVIEW_READ_WRITE_TOKEN || process.env.PROD_READ_WRITE_TOKEN
  );
}

function getEnvironmentScopedStoreId(): string | undefined {
  const vercelEnv = (process.env.VERCEL_ENV || "").toLowerCase();

  if (vercelEnv === "preview") {
    return process.env.PREVIEW_STORE_ID;
  }

  if (vercelEnv === "production") {
    return process.env.PROD_STORE_ID;
  }

  return process.env.PREVIEW_STORE_ID || process.env.PROD_STORE_ID;
}

function resolveBlobConfig(): ResolvedBlobConfig {
  const readWriteToken =
    process.env.BLOB_READ_WRITE_TOKEN || getEnvironmentScopedReadWriteToken();
  if (readWriteToken) {
    return { kind: "token", token: readWriteToken };
  }

  const storeId = process.env.BLOB_STORE_ID || getEnvironmentScopedStoreId();
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  if (storeId && oidcToken) {
    return { kind: "oidc", storeId, oidcToken };
  }

  return null;
}

function hasBlobConfig(): boolean {
  return Boolean(resolveBlobConfig());
}

export function isBookAssetStorageConfigured(): boolean {
  return hasBlobConfig();
}

function bufferToDataUrl(buffer: Buffer, contentType: string): string {
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

export async function storeBookAsset(input: {
  pathname: string;
  body: string | Buffer | ArrayBuffer;
  contentType: string;
}): Promise<string> {
  const { pathname, body, contentType } = input;
  const blobConfig = resolveBlobConfig();

  if (!blobConfig) {
    if (typeof body === "string") {
      return bufferToDataUrl(Buffer.from(body, "utf8"), contentType);
    }

    if (body instanceof ArrayBuffer) {
      return bufferToDataUrl(Buffer.from(body), contentType);
    }

    return bufferToDataUrl(body, contentType);
  }

  const blob = await put(pathname, body, {
    access: "public",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType,
    ...(blobConfig.kind === "token"
      ? { token: blobConfig.token }
      : { storeId: blobConfig.storeId, oidcToken: blobConfig.oidcToken }),
  });

  return blob.url;
}

/**
 * True only when the configured Blob store is provisioned for private access
 * (Vercel rejects `access: "private"` on a public store). Opt-in so the default
 * public store keeps working; set `BLOB_PRIVATE_ACCESS_ENABLED=true` once a
 * private store is wired up.
 */
function privateBlobAccessEnabled(): boolean {
  return process.env.BLOB_PRIVATE_ACCESS_ENABLED === "true";
}

/**
 * Store a short-lived asset (e.g. an uploaded room photo used only to seed an
 * establishing illustration). Returns a reference the worker can read back and
 * later delete.
 *
 * Privacy: when a private Blob store is configured
 * (`BLOB_PRIVATE_ACCESS_ENABLED=true`) the blob uses `access: "private"` so a
 * leaked/guessed URL cannot expose a family photo. Otherwise it falls back to a
 * public blob with a high-entropy random suffix (URL is not guessable) and is
 * deleted immediately after the illustration is drawn. When blob storage isn't
 * configured at all (local), falls back to an inline data URL.
 */
export async function storeTemporaryPrivateAsset(input: {
  pathname: string;
  body: string | Buffer | ArrayBuffer;
  contentType: string;
}): Promise<{ ref: string; isInline: boolean }> {
  const blobConfig = resolveBlobConfig();
  if (!blobConfig) {
    const buffer =
      typeof input.body === "string"
        ? Buffer.from(input.body, "utf8")
        : input.body instanceof ArrayBuffer
          ? Buffer.from(input.body)
          : input.body;
    return { ref: bufferToDataUrl(buffer, input.contentType), isInline: true };
  }

  if (privateBlobAccessEnabled()) {
    await put(input.pathname, input.body, {
      access: "private",
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: input.contentType,
      ...getBlobCommandOptions(blobConfig),
    });
    // Reference by pathname; private blobs are read back with get(..., private).
    return { ref: input.pathname, isInline: false };
  }

  // Public store fallback: unguessable URL + prompt deletion after use.
  const blob = await put(input.pathname, input.body, {
    access: "public",
    addRandomSuffix: true,
    contentType: input.contentType,
    ...getBlobCommandOptions(blobConfig),
  });
  // Reference by full URL so read-back/delete work without private access.
  return { ref: blob.url, isInline: false };
}

/** Read back a private temporary asset stored via storeTemporaryPrivateAsset. */
export async function readTemporaryPrivateAsset(
  ref: string
): Promise<{ buffer: Buffer; contentType: string }> {
  if (ref.startsWith("data:")) {
    const comma = ref.indexOf(",");
    const meta = ref.slice(5, comma);
    const isBase64 = meta.includes(";base64");
    const payload = ref.slice(comma + 1);
    const buffer = isBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
    return { buffer, contentType: meta.split(";")[0] || "image/png" };
  }

  // Public fallback stores the full (unguessable) URL — fetch it directly.
  if (ref.startsWith("http://") || ref.startsWith("https://")) {
    const res = await fetch(ref, { cache: "no-store" });
    if (!res.ok) throw new Error("Temporary photo is unavailable");
    const arrayBuffer = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: res.headers.get("content-type") || "image/png",
    };
  }

  const blobConfig = resolveBlobConfig();
  if (!blobConfig) throw new Error("Temporary photo is unavailable");
  const result = await get(ref, {
    access: "private",
    useCache: false,
    ...getBlobCommandOptions(blobConfig),
  });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error("Temporary photo is unavailable");
  }
  const chunks: Uint8Array[] = [];
  const reader = result.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return {
    buffer: Buffer.concat(chunks.map((c) => Buffer.from(c))),
    contentType: result.blob.contentType || "image/png",
  };
}

/** Best-effort delete of temporary asset refs (URLs, pathnames, or inline). */
export async function deleteTemporaryPrivateAssets(
  refs: string[]
): Promise<void> {
  const deletable = refs.filter((ref) => ref && !ref.startsWith("data:"));
  if (deletable.length === 0) return;
  const blobConfig = resolveBlobConfig();
  if (!blobConfig) return;
  await del(deletable, getBlobCommandOptions(blobConfig)).catch(() => undefined);
}

// Returns the public URL if a blob already exists at pathname, null otherwise.
export async function findBookAsset(pathname: string): Promise<string | null> {
  const blobConfig = resolveBlobConfig();
  if (!blobConfig) return null;
  try {
    const { blobs } = await list({
      prefix: pathname,
      limit: 1,
      ...getBlobCommandOptions(blobConfig),
    });
    return blobs[0]?.url ?? null;
  } catch {
    return null;
  }
}

function getBlobCommandOptions(blobConfig: Exclude<ResolvedBlobConfig, null>) {
  return blobConfig.kind === "token"
    ? { token: blobConfig.token }
    : { storeId: blobConfig.storeId, oidcToken: blobConfig.oidcToken };
}

function isDeletableBookBlobUrl(value?: string): value is string {
  if (!value) return false;
  if (value.startsWith("data:")) return false;

  try {
    const url = new URL(value);
    return url.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export function collectBookAssetUrls(project: BookProject): string[] {
  const urls = new Set<string>();
  const add = (value?: string) => {
    if (isDeletableBookBlobUrl(value)) urls.add(value);
  };

  add(project.assets.coverImageUrl);
  add(project.assets.coverWebImageUrl);
  add(project.assets.coverPdfUrl);
  add(project.assets.luluCoverPdfUrl);
  add(project.assets.previewPdfUrl);
  add(project.assets.printPdfUrl);
  add(project.assets.luluPrintPdfUrl);
  add(project.assets.epubUrl);
  project.assets.previewImages?.forEach(add);

  for (const spread of project.spreads) {
    add(spread.imageUrl);
    add(spread.leftPageImageUrl);
    add(spread.leftPageWebImageUrl);
    add(spread.rightPageImageUrl);
    add(spread.thumbnailUrl);
  }

  return Array.from(urls);
}

export function collectBookDownloadableAssetUrls(
  project: BookProject
): string[] {
  const urls = new Set<string>();
  const retainedUrls = new Set([project.assets.coverImageUrl]);
  const add = (value?: string) => {
    if (retainedUrls.has(value)) return;
    if (isDeletableBookBlobUrl(value)) urls.add(value);
  };

  add(project.assets.coverPdfUrl);
  add(project.assets.luluCoverPdfUrl);
  add(project.assets.previewPdfUrl);
  add(project.assets.printPdfUrl);
  add(project.assets.luluPrintPdfUrl);
  add(project.assets.epubUrl);
  project.assets.previewImages?.forEach(add);

  return Array.from(urls);
}

export async function deleteBookAssetUrls(urls: string[]): Promise<number> {
  const deletableUrls = urls.filter(isDeletableBookBlobUrl);
  if (deletableUrls.length === 0) return 0;

  const blobConfig = resolveBlobConfig();
  if (!blobConfig) {
    throw new Error("Blob storage is not configured for deleting book assets");
  }

  await del(deletableUrls, getBlobCommandOptions(blobConfig));
  return deletableUrls.length;
}

export async function deleteBookProjectAssets(
  project: BookProject
): Promise<number> {
  const urls = collectBookAssetUrls(project);
  return deleteBookAssetUrls(urls);
}
