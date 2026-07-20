import { del, put } from "@vercel/blob";
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
      : { storeId: blobConfig.storeId, token: blobConfig.oidcToken }),
  });

  return blob.url;
}

function getBlobCommandOptions(blobConfig: Exclude<ResolvedBlobConfig, null>) {
  return blobConfig.kind === "token"
    ? { token: blobConfig.token }
    : { storeId: blobConfig.storeId, token: blobConfig.oidcToken };
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
    add(spread.rightPageImageUrl);
    add(spread.thumbnailUrl);
  }

  return Array.from(urls);
}

export async function deleteBookProjectAssets(
  project: BookProject
): Promise<number> {
  const urls = collectBookAssetUrls(project);
  if (urls.length === 0) return 0;

  const blobConfig = resolveBlobConfig();
  if (!blobConfig) {
    throw new Error("Blob storage is not configured for deleting book assets");
  }

  await del(urls, getBlobCommandOptions(blobConfig));
  return urls.length;
}
