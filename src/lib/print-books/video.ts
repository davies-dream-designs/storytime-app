import sharp from "sharp";
import type { BookSpread, CharacterBible } from "@/types/printBook";
import { storeBookAsset } from "@/lib/print-books/storage";

const KLING_MODEL = "fal-ai/kling-video/v2.1/standard/image-to-video";
const KLING_DURATION = "5";

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
// Kling API via fal.ai
// ---------------------------------------------------------------------------

type KlingSubmitResponse = { request_id: string };
type KlingStatusResponse = {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  error?: unknown;
};
type KlingResultResponse = {
  video?: { url?: string };
  error?: unknown;
};

async function falPost(path: string, body: unknown): Promise<Response> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) throw new Error("FAL_KEY is not configured");

  return fetch(`https://queue.fal.run/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function falGet(path: string): Promise<Response> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) throw new Error("FAL_KEY is not configured");

  return fetch(`https://queue.fal.run/${path}`, {
    headers: { Authorization: `Key ${apiKey}` },
  });
}

export async function submitKlingJob(
  imageUrl: string,
  prompt: string
): Promise<string> {
  const res = await falPost(KLING_MODEL, {
    image_url: imageUrl,
    prompt,
    duration: KLING_DURATION,
    aspect_ratio: "1:1",
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kling submit failed: ${res.status} ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as KlingSubmitResponse;
  if (!data.request_id) throw new Error("Kling submit returned no request_id");
  return data.request_id;
}

export async function pollKlingJob(
  requestId: string
): Promise<{ done: boolean; videoUrl?: string; failed?: boolean; error?: string }> {
  // Use /status for a non-blocking check — GET without /status enters long-poll
  // mode and blocks until the job finishes (or returns 405 on failure).
  const statusRes = await falGet(`${KLING_MODEL}/requests/${requestId}/status`);

  if (!statusRes.ok) {
    const body = await statusRes.text();
    console.error(`Kling status check failed: ${statusRes.status}`, body.slice(0, 400));
    throw new Error(`Kling poll failed: ${statusRes.status} — ${body.slice(0, 200)}`);
  }

  const statusData = (await statusRes.json()) as KlingStatusResponse;
  console.log(`Kling request ${requestId} status: ${statusData.status}`);

  if (statusData.status === "FAILED") {
    const errDetail = JSON.stringify(statusData.error ?? "Kling generation failed");
    console.error(`Kling job failed for ${requestId}:`, errDetail);
    return { done: true, failed: true, error: errDetail.slice(0, 200) };
  }

  if (statusData.status !== "COMPLETED") {
    return { done: false };
  }

  // Fetch the actual result now that it's done
  const resultRes = await falGet(`${KLING_MODEL}/requests/${requestId}`);
  if (!resultRes.ok) {
    const body = await resultRes.text();
    console.error(`Kling result fetch failed: ${resultRes.status}`, body.slice(0, 400));
    throw new Error(`Kling result fetch failed: ${resultRes.status}`);
  }

  const resultData = (await resultRes.json()) as KlingResultResponse;
  const videoUrl = resultData.video?.url;
  if (!videoUrl) {
    console.error("Kling completed but no video URL:", JSON.stringify(resultData).slice(0, 400));
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
