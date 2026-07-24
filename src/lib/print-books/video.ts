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
  // Pull the first sentence of each bible field — enough for Kling, not so much
  // that it confuses the motion model with too many constraints.
  const appearance =
    characterBible.childAppearance.split(".")[0]?.trim() ??
    characterBible.childAppearance;
  const palette = characterBible.palette.split(",")[0]?.trim() ?? characterBible.palette;
  const companions = characterBible.companionCharacters.slice(0, 2).join(" and ");

  const parts = [
    // Scene context so Kling understands the moment
    spread.sceneBrief
      ? `Scene: ${spread.sceneBrief.slice(0, 120)}.`
      : "",

    // Motion style — gentle, bedtime, children's book feel
    "Bring this children's watercolour illustration gently to life.",
    "Soft warm light flickers, the main character breathes slowly,",
    "leaves or loose fabric drift in a gentle breeze, warm magical atmosphere.",

    // Character consistency — critical so the character doesn't morph
    `Main character: ${appearance.slice(0, 80)}.`,
    companions ? `Also present: ${companions}.` : "",
    `Colour palette: ${palette.slice(0, 60)}.`,

    // Technical constraints
    "Single continuous shot — no cuts, no camera change, no scene transition.",
    "Preserve the watercolour illustration art style exactly.",
    "Slow, calm movement only. This is a bedtime story — keep it dreamy and peaceful.",
    "Do not introduce new characters, objects, or background elements.",
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
