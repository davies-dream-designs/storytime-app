import sharp from "sharp";
import { fal } from "@fal-ai/client";
import type { BookSpread, CharacterBible } from "@/types/printBook";
import { storeBookAsset } from "@/lib/print-books/storage";

const KLING_MODEL = "fal-ai/kling-video/v2.1/standard/image-to-video";
const KLING_DURATION = "5";

function configureFal() {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not configured");
  fal.config({ credentials: key });
}

export function isVideoConfigured(): boolean {
  return Boolean(process.env.FAL_KEY);
}

// ---------------------------------------------------------------------------
// Motion prompt builder
// ---------------------------------------------------------------------------

function cap(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

export function buildKlingMotionPrompt(
  spread: BookSpread,
  _characterBible: CharacterBible
): string {
  // For image-to-video, Kling reads all character/visual detail from the
  // reference image — describing appearance, outfit, or palette in text
  // makes Kling animate those elements independently (e.g. a cape floats
  // above the character still wearing it). Prompt should be motion + atmosphere
  // only. Keep it short so the model focuses on movement, not construction.
  const sceneBrief = cap(spread.sceneBrief ?? "", 150);

  const parts = [
    sceneBrief ? `Scene: ${sceneBrief}.` : "",
    "Gently animate this children's watercolour illustration.",
    "Soft warm light flickers slowly.",
    "Characters breathe calmly and move only with subtle natural motion.",
    "Leaves, hair, and loose fabric drift slightly in a gentle breeze.",
    "Warm dreamy bedtime atmosphere.",
    "Single continuous shot — no cuts, no sudden movement, no new elements.",
    "Preserve the watercolour illustration art style exactly.",
  ];

  const prompt = parts.filter(Boolean).join(" ");
  return prompt.length <= 2400 ? prompt : prompt.slice(0, 2400);
}

// ---------------------------------------------------------------------------
// Kling API via @fal-ai/client SDK
// Using the SDK avoids manually constructing queue URLs — fal's request_id
// format includes model context and must not be embedded in raw URL paths.
// ---------------------------------------------------------------------------

export async function submitKlingJob(
  imageUrl: string,
  prompt: string
): Promise<string> {
  configureFal();
  // Cast to unknown first — the SDK's input type for this model doesn't
  // expose all parameters (e.g. aspect_ratio) but the API accepts them.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { request_id } = await (fal.queue.submit as any)(KLING_MODEL, {
    input: {
      image_url: imageUrl,
      prompt,
      duration: KLING_DURATION,
      aspect_ratio: "1:1",
    },
  });
  console.log(`Kling job submitted: ${request_id}`);
  return request_id;
}

export async function pollKlingJob(
  requestId: string
): Promise<{ done: boolean; videoUrl?: string; failed?: boolean; error?: string }> {
  configureFal();

  let status: Awaited<ReturnType<typeof fal.queue.status>>;
  try {
    status = await fal.queue.status(KLING_MODEL, { requestId, logs: false });
  } catch (err) {
    // SDK throws when the job fails — treat as a terminal failure.
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`Kling job failed for ${requestId}:`, errMsg);
    return { done: true, failed: true, error: errMsg.slice(0, 200) };
  }

  console.log(`Kling request ${requestId} status: ${status.status}`);

  if (status.status !== "COMPLETED") {
    return { done: false };
  }

  // Job is done — fetch the result.
  const result = await fal.queue.result(KLING_MODEL, { requestId });
  const output = result.data as { video?: { url?: string } } | undefined;
  const videoUrl = output?.video?.url;
  if (!videoUrl) {
    console.error("Kling completed but no video URL:", JSON.stringify(output).slice(0, 400));
    throw new Error("Kling completed but returned no video URL");
  }

  return { done: true, videoUrl };
}

// ---------------------------------------------------------------------------
// Image prep — resize print-quality illustrations down to 1024px for Kling.
// Stored illustrations are 2490×2490 (~16MB PNG) — Kling only outputs 960px
// regardless of input, so feeding it 16MB buys nothing and slows the API call.
// We resize to 1024×1024 JPEG (~150-300KB) and store alongside the spread so
// the same source image is reused on any retries.
// ---------------------------------------------------------------------------

export async function prepareVideoSourceImage(
  projectId: string,
  spreadId: string,
  sourceImageUrl: string
): Promise<string> {
  const res = await fetch(sourceImageUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch source image: ${res.status} ${sourceImageUrl}`
    );
  }
  const raw = Buffer.from(await res.arrayBuffer());
  const resized = await sharp(raw)
    .resize(1024, 1024, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88 })
    .toBuffer();

  return storeBookAsset({
    pathname: `books/${projectId}/video-source/${spreadId}.jpg`,
    body: resized,
    contentType: "image/jpeg",
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// All story spreads in sequence — used for narration (every page has text
// regardless of whether its illustration succeeded).
export function getStorySpreads(spreads: BookSpread[]): BookSpread[] {
  return spreads
    .filter(
      (s) =>
        s.layoutType === "text_art" ||
        s.layoutType === "hero" ||
        s.layoutType === "quiet"
    )
    .sort((a, b) => a.sequence - b.sequence);
}

// Story spreads that have a real (non-placeholder) illustration — used for
// Kling video generation and for returning clip URLs.
export function getIllustratedSpreads(spreads: BookSpread[]): BookSpread[] {
  return getStorySpreads(spreads).filter(
    (s) =>
      s.leftPageImageUrl &&
      !s.leftPageImageUrl.endsWith(".svg") &&
      !s.leftPageImageUrl.startsWith("data:image/svg")
  );
}
