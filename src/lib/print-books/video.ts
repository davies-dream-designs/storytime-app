import sharp from "sharp";
import { fal } from "@fal-ai/client";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { BookSpread, CharacterBible } from "@/types/printBook";
import { storeBookAsset } from "@/lib/print-books/storage";

const execFileAsync = promisify(execFile);

// Resolve ffmpeg binary at runtime so Next.js bundling can't corrupt the
// path — ffmpeg-static returns a string, not a binary, and webpack treats
// it as a resolvable module which breaks the path in standalone output.
function getFfmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require("ffmpeg-static") as string | null;
    if (p) return p;
  } catch {}
  return "ffmpeg"; // fall back to system ffmpeg if available
}

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
// Frame extraction — pulls the last frame of a Kling clip for chaining.
// Each clip's last frame becomes the input image for the next clip so
// the character appearance is inherited rather than re-derived from the
// flat illustration each time.
// ---------------------------------------------------------------------------

export async function extractLastFrame(
  videoUrl: string,
  projectId: string,
  spreadId: string
): Promise<string> {
  const ffmpegPath = getFfmpegPath();

  // Download the video
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Failed to fetch video: ${res.status}`);
  const videoBuffer = Buffer.from(await res.arrayBuffer());

  const id = `${projectId}-${spreadId}-${Date.now()}`;
  const tmpVideo = join(tmpdir(), `${id}.mp4`);
  const tmpFrame = join(tmpdir(), `${id}.jpg`);

  await writeFile(tmpVideo, videoBuffer);

  try {
    // Seek to 4.8s (just before the 5s clip ends) and extract one frame
    await execFileAsync(ffmpegPath, [
      "-ss", "4.8",
      "-i", tmpVideo,
      "-frames:v", "1",
      "-q:v", "2",
      "-y",
      tmpFrame,
    ]);

    const frameBuffer = await readFile(tmpFrame);

    // Resize to 1024×1024 for Kling input
    const resized = await sharp(frameBuffer)
      .resize(1024, 1024, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .jpeg({ quality: 88 })
      .toBuffer();

    return storeBookAsset({
      pathname: `books/${projectId}/video-frames/${spreadId}.jpg`,
      body: resized,
      contentType: "image/jpeg",
    });
  } finally {
    await Promise.allSettled([unlink(tmpVideo), unlink(tmpFrame)]);
  }
}

// ---------------------------------------------------------------------------
// Kling API via @fal-ai/client SDK
// Using the SDK avoids manually constructing queue URLs — fal's request_id
// format includes model context and must not be embedded in raw URL paths.
// ---------------------------------------------------------------------------

export async function submitKlingJob(
  imageUrl: string,
  prompt: string,
  webhookUrl: string
): Promise<string> {
  configureFal();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { request_id } = await (fal.queue.submit as any)(KLING_MODEL, {
    input: {
      image_url: imageUrl,
      prompt,
      duration: KLING_DURATION,
      aspect_ratio: "1:1",
    },
    webhookUrl,
  });
  console.log(`Kling job submitted: ${request_id}`);
  return request_id;
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
