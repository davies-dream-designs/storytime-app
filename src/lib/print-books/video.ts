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

export function buildKlingMotionPrompt(
  spread: BookSpread,
  characterBible: CharacterBible
): string {
  const appearance = characterBible.childAppearance.trim();
  const outfit = characterBible.outfitRules.split(".")[0]?.trim() ?? characterBible.outfitRules;
  const palette = characterBible.palette.trim();
  const companions = characterBible.companionCharacters.slice(0, 2).join(" and ");

  const parts = [
    // Illustration direction first — this is the richest scene description.
    spread.illustrationPrompt
      ? `Illustration: ${spread.illustrationPrompt}.`
      : "",
    // Scene brief adds the emotional/narrative layer.
    spread.sceneBrief
      ? `Scene: ${spread.sceneBrief}.`
      : "",

    // Motion style — gentle, dreamy, children's book atmosphere.
    "Bring this children's watercolour illustration gently to life.",
    "Soft warm light flickers slowly, the main character breathes calmly,",
    "loose fabric or foliage sways in a gentle breeze.",
    "Warm, magical, dreamy bedtime atmosphere throughout.",

    // Character consistency — prevent the model drifting the character's appearance.
    `Main character appearance: ${appearance}.`,
    `Outfit: ${outfit}.`,
    companions ? `Also present: ${companions}.` : "",
    `Colour palette: ${palette}.`,

    // Hard technical constraints.
    "Single continuous shot — absolutely no cuts, no camera changes, no scene transitions.",
    "Preserve the watercolour illustration art style exactly — do not make it look photorealistic.",
    "Slow and calm movement only. No sudden motion, no dialogue, no speaking.",
    "Do not introduce any new characters, objects, text, or background elements not in the original illustration.",
    "No sound or speech — visuals only.",
  ];

  return parts.filter(Boolean).join(" ");
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

export function getIllustratedSpreads(spreads: BookSpread[]): BookSpread[] {
  return spreads.filter(
    (s) =>
      (s.layoutType === "text_art" ||
        s.layoutType === "hero" ||
        s.layoutType === "quiet") &&
      s.leftPageImageUrl &&
      !s.leftPageImageUrl.endsWith(".svg") &&
      !s.leftPageImageUrl.startsWith("data:image/svg")
  );
}
