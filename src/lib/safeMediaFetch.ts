/**
 * Guarded fetch for user-referenced media (avatars, location references, etc.).
 *
 * User records can carry image URLs that later get fetched server-side to build
 * illustration conditioning. Fetching an arbitrary owner-supplied URL is an SSRF
 * primitive, so every such fetch must go through here: only our own blob store
 * (and inline `data:` URLs) are allowed, and responses are bounded by time and
 * size.
 */

const ALLOWED_HOST_SUFFIX = ".blob.vercel-storage.com";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

export class UnsafeMediaUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeMediaUrlError";
  }
}

/** True for URLs we are willing to fetch server-side (own blob store only). */
export function isAllowedMediaUrl(url: string): boolean {
  if (typeof url !== "string" || url.length === 0) return false;
  if (url.startsWith("data:")) return true;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase();
  return host.endsWith(ALLOWED_HOST_SUFFIX);
}

function decodeDataUrl(url: string): Buffer {
  const comma = url.indexOf(",");
  if (comma === -1) throw new UnsafeMediaUrlError("Malformed data URL");
  const meta = url.slice(5, comma);
  const payload = url.slice(comma + 1);
  if (meta.includes(";base64")) {
    return Buffer.from(payload, "base64");
  }
  return Buffer.from(decodeURIComponent(payload), "utf8");
}

/**
 * Fetch owned media into a Buffer, or throw `UnsafeMediaUrlError` for any URL
 * outside the allowlist. Enforces a request timeout and a maximum body size.
 */
export async function fetchAllowedMediaBuffer(
  url: string,
  options?: { timeoutMs?: number; maxBytes?: number }
): Promise<{ buffer: Buffer; contentType: string }> {
  if (!isAllowedMediaUrl(url)) {
    throw new UnsafeMediaUrlError("Media URL is not from an allowed source");
  }
  if (url.startsWith("data:")) {
    const contentType = url.slice(5, url.indexOf(",")).split(";")[0] || "image/png";
    return { buffer: decodeDataUrl(url), contentType };
  }

  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Media fetch failed with status ${response.status}`);
    }
    const declaredLength = Number(
      response.headers?.get("content-length") ?? "0"
    );
    if (declaredLength && declaredLength > maxBytes) {
      throw new Error("Media exceeds maximum allowed size");
    }
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new Error("Media exceeds maximum allowed size");
    }
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: response.headers?.get("content-type") || "image/png",
    };
  } finally {
    clearTimeout(timer);
  }
}
