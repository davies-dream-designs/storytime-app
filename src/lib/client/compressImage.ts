/**
 * Downscale and re-encode an image in the browser before upload.
 *
 * Phone photos are often several MB each; uploading a handful of originals in
 * one request can exceed the serverless request-body limit and fail. The server
 * resizes to 1024px anyway, so shrinking client-side loses no useful detail
 * while keeping the upload small and fast.
 */
export async function compressImageForUpload(
  file: File,
  { maxEdge = 1600, quality = 0.82 }: { maxEdge?: number; quality?: number } = {}
): Promise<File> {
  if (typeof document === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // If the browser can't decode it, let the server validation handle it.
    return file;
  }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) return file;

  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}
