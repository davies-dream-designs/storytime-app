import sharp from "sharp";
import type { ChildProfile, Story } from "@/types";
import type {
  BookProject,
  BookSpread,
  CharacterBible,
  OpenAIImageBatchAsset,
  OpenAIImageBatchStatus,
} from "@/types/printBook";
import { BOOK_SPEC } from "@/lib/print-books/bookConfig";
import { buildIllustrationDirection } from "@/lib/print-books/characterBible";
import {
  isBookAssetStorageConfigured,
  storeBookAsset,
} from "@/lib/print-books/storage";

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

export type ImageProvider = "openai" | "flux" | "recraft";

export function getImageProvider(): ImageProvider {
  const val = process.env.IMAGE_PROVIDER?.trim().toLowerCase();
  if (val === "flux") return "flux";
  if (val === "recraft") return "recraft";
  return "openai";
}

function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function isFalConfigured(): boolean {
  return Boolean(process.env.FAL_KEY);
}

// True when the selected provider has its credentials AND blob storage is ready.
export function isGeneratedIllustrationConfigured(): boolean {
  if (!isBookAssetStorageConfigured()) return false;
  const provider = getImageProvider();
  if (provider === "openai") return isOpenAIConfigured();
  return isFalConfigured(); // flux and recraft both use FAL_KEY
}

// Batch API path is disabled — all providers use the per-spread cursor path
// so the progress grid works and builds complete in minutes rather than hours.
export function shouldUseImageBatch(): boolean {
  return false;
}

// ---------------------------------------------------------------------------
// Upscaling
// ---------------------------------------------------------------------------

// Upscale a square PNG buffer from 1024×1024 (OpenAI output) to the print-quality
// target defined in BOOK_SPEC (300 PPI at the trim size = 2490×2490 px).
async function upscaleImageBuffer(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize(BOOK_SPEC.upscaleWidthPx, BOOK_SPEC.upscaleHeightPx, {
      kernel: sharp.kernel.lanczos3,
      fit: "fill",
    })
    .png({ compressionLevel: 7 })
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Placeholder SVG generators (used when OpenAI is not configured)
// ---------------------------------------------------------------------------

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clampText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function splitTitleLines(
  value: string,
  maxChars: number,
  maxLines: number
): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ["Untitled"];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    current = word;
  }

  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;

  const capped = lines.slice(0, maxLines);
  capped[maxLines - 1] = clampText(capped[maxLines - 1] || "", maxChars);
  return capped;
}

type PlaceholderCoverTheme = {
  skyTop: string;
  skyMid: string;
  skyBottom: string;
  moon: string;
  hillFront: string;
  hillBack: string;
  accent: string;
  accentSoft: string;
  motif: "ocean" | "garden" | "night" | "adventure";
};

function pickPlaceholderCoverTheme(story: Story): PlaceholderCoverTheme {
  const source =
    `${story.title} ${story.theme || ""} ${story.pages[0]?.text || ""} ${story.pages[0]?.illustrationPrompt || ""}`.toLowerCase();

  if (/(wave|ocean|sea|beach|shore|sand|pebble|shell|tide)/.test(source)) {
    return {
      skyTop: "#1f2f63",
      skyMid: "#5860a9",
      skyBottom: "#f0d6aa",
      moon: "#fff1bc",
      hillFront: "#1d3764",
      hillBack: "#27477c",
      accent: "#f6ce69",
      accentSoft: "#ffe7ba",
      motif: "ocean",
    };
  }

  if (
    /(garden|flower|forest|tree|leaf|meadow|field|fox|rabbit|bunny)/.test(
      source
    )
  ) {
    return {
      skyTop: "#21414d",
      skyMid: "#5d7d68",
      skyBottom: "#f3ddb4",
      moon: "#fdf0be",
      hillFront: "#274837",
      hillBack: "#3f674d",
      accent: "#f4c867",
      accentSoft: "#f9ebc9",
      motif: "garden",
    };
  }

  if (/(moon|star|night|sleep|dream|sky|cloud)/.test(source)) {
    return {
      skyTop: "#1d2552",
      skyMid: "#4d5198",
      skyBottom: "#e8cfa5",
      moon: "#fff2c8",
      hillFront: "#1c2f5d",
      hillBack: "#31457f",
      accent: "#f6cd68",
      accentSoft: "#fff1c8",
      motif: "night",
    };
  }

  return {
    skyTop: "#29356b",
    skyMid: "#645ca8",
    skyBottom: "#efd8b0",
    moon: "#fff1c4",
    hillFront: "#223463",
    hillBack: "#31467d",
    accent: "#f7cf68",
    accentSoft: "#ffebc2",
    motif: "adventure",
  };
}

function getCoverSpread(spreads: BookSpread[]): BookSpread | undefined {
  return spreads.find(
    (spread) => spread.sequence === 1 || spread.title === "Cover"
  );
}

export function buildCoverIllustrationPrompt(input: {
  project: BookProject;
  story: Story;
  profile: ChildProfile;
  characterBible: CharacterBible;
  coverSpread?: BookSpread;
}): string {
  if (getImageProvider() === "recraft") {
    return buildRecrartCoverPrompt(input);
  }

  const { story, profile, characterBible, coverSpread } = input;
  const sceneDirection =
    coverSpread?.illustrationPrompt ??
    `Front cover for "${story.title}" starring ${profile.name}.`;

  return [
    buildIllustrationDirection(characterBible),
    `Book title: ${story.title}.`,
    `Main child: ${profile.name}.`,
    `Age band: ${input.project.ageBand}.`,
    `Theme: ${story.theme || "gentle bedtime adventure"}.`,
    `Cover scene: ${sceneDirection}`,
    "Create a square children's picture-book front cover with space for title treatment and a warm bedtime-book feeling.",
    "Do not render any visible publisher logo or extra text into the art itself.",
  ].join(" ");
}

function createPlaceholderCoverSvg(input: {
  story: Story;
  profile: ChildProfile;
  characterBible: CharacterBible;
}): string {
  const { story, profile, characterBible } = input;
  const title = escapeXml(clampText(story.title, 56));
  const childName = escapeXml(profile.name);
  const titleLines = splitTitleLines(story.title, 17, 3);
  const titleSize =
    titleLines.length === 1 ? 88 : titleLines.length === 2 ? 76 : 68;
  const titleLineStep = titleSize + 12;
  const titleBlockHeight = titleLineStep * titleLines.length;
  const subtitleY = 434 + titleBlockHeight;
  const theme = pickPlaceholderCoverTheme(story);
  const companion = escapeXml(
    clampText(characterBible.companionCharacters[0] || "a storybook friend", 28)
  );

  // Square 1024×1024 to match the trim (was incorrectly 1024×1536 portrait).
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${theme.skyTop}"/>
      <stop offset="58%" stop-color="${theme.skyMid}"/>
      <stop offset="100%" stop-color="${theme.skyBottom}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#sky)"/>
  <circle cx="796" cy="160" r="80" fill="${theme.moon}" opacity="0.95"/>
  <circle cx="796" cy="160" r="104" fill="${theme.moon}" opacity="0.08"/>
  <circle cx="182" cy="148" r="4" fill="#fff6de" opacity="0.75"/>
  <circle cx="228" cy="178" r="3" fill="#fff6de" opacity="0.55"/>
  <circle cx="884" cy="256" r="4" fill="#fff6de" opacity="0.7"/>
  <circle cx="832" cy="290" r="3" fill="#fff6de" opacity="0.6"/>
  <path d="M0 680 C136 636 282 612 412 638 C562 668 650 730 794 722 C882 716 955 686 1024 650 L1024 1024 L0 1024 Z" fill="${theme.hillBack}"/>
  <path d="M0 750 C142 714 286 700 420 724 C578 753 681 820 832 808 C906 802 972 776 1024 752 L1024 1024 L0 1024 Z" fill="${theme.hillFront}"/>
  <rect x="80" y="80" width="864" height="864" rx="36" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="5"/>
  <g transform="translate(112 112)">
    <rect x="0" y="0" width="216" height="58" rx="29" fill="rgba(255,249,235,0.12)" stroke="rgba(255,249,235,0.22)" stroke-width="2"/>
    <circle cx="38" cy="29" r="14" fill="${theme.accent}"/>
    <path d="M18 38 C30 28 44 28 58 38" fill="none" stroke="#fff8ea" stroke-width="4" stroke-linecap="round"/>
    <text x="76" y="38" fill="#fff8ea" font-size="24" font-family="Arial, sans-serif" font-weight="700">Storycot</text>
  </g>
  <text x="112" y="224" fill="#fff4d5" font-size="18" font-family="Arial, sans-serif" letter-spacing="3">PERSONALISED BEDTIME STORY</text>
  <text x="112" y="306" fill="#fffdf8" font-size="${titleSize}" font-family="Georgia, serif" font-weight="700">
    <tspan x="112" dy="0">${escapeXml(titleLines[0] || "")}</tspan>
    ${titleLines[1] ? `<tspan x="112" dy="${titleLineStep}">${escapeXml(titleLines[1])}</tspan>` : ""}
    ${titleLines[2] ? `<tspan x="112" dy="${titleLineStep}">${escapeXml(titleLines[2])}</tspan>` : ""}
  </text>
  <text x="112" y="${subtitleY}" fill="#fff0c8" font-size="28" font-family="Georgia, serif">A story for ${childName}</text>
  <g transform="translate(0 24)">
    <path d="M112 640 C220 596 338 572 468 596 C604 624 694 670 804 664 C878 660 948 638 1012 614" fill="none" stroke="${theme.accentSoft}" stroke-width="10" stroke-linecap="round" opacity="0.95"/>
    ${
      theme.motif === "ocean"
        ? `<circle cx="432" cy="634" r="14" fill="${theme.accent}" opacity="0.96"/>
           <circle cx="472" cy="618" r="10" fill="${theme.accentSoft}" opacity="0.88"/>
           <circle cx="510" cy="638" r="16" fill="${theme.accent}" opacity="0.8"/>`
        : theme.motif === "garden"
          ? `<circle cx="448" cy="614" r="22" fill="${theme.accent}" opacity="0.92"/>
             <circle cx="490" cy="614" r="22" fill="${theme.accent}" opacity="0.86"/>
             <circle cx="468" cy="584" r="18" fill="${theme.accentSoft}" opacity="0.92"/>`
          : theme.motif === "night"
            ? `<circle cx="446" cy="618" r="16" fill="${theme.accent}" opacity="0.92"/>
               <circle cx="482" cy="600" r="11" fill="${theme.accentSoft}" opacity="0.9"/>
               <circle cx="514" cy="622" r="8" fill="${theme.accent}" opacity="0.82"/>`
            : `<circle cx="420" cy="632" r="14" fill="${theme.accent}" opacity="0.92"/>
               <circle cx="540" cy="572" r="11" fill="${theme.accentSoft}" opacity="0.9"/>
               <circle cx="590" cy="548" r="8" fill="${theme.accent}" opacity="0.82"/>`
    }
  </g>
  <rect x="112" y="900" width="308" height="56" rx="28" fill="rgba(255,248,230,0.12)" stroke="rgba(255,248,230,0.2)" stroke-width="2"/>
  <text x="146" y="936" fill="#fff4d8" font-size="22" font-family="Arial, sans-serif">Featuring ${companion}</text>
</svg>`;
}

function createPlaceholderPageSvg(input: {
  story: Story;
  profile: ChildProfile;
  characterBible: CharacterBible;
  spread: BookSpread;
  side: "left" | "right";
}): string {
  const { story, profile, characterBible, spread, side } = input;
  const title = escapeXml(clampText(story.title, 48));
  const sceneBrief = escapeXml(clampText(spread.sceneBrief, 120));
  const childName = escapeXml(profile.name);
  const palette = escapeXml(characterBible.palette);
  const pageText = escapeXml(
    clampText(side === "left" ? spread.leftPageText : spread.rightPageText, 160)
  );
  const sideLabel =
    side === "left" ? `PAGE ${spread.pageStart}` : `PAGE ${spread.pageEnd}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1b2b5a"/>
      <stop offset="55%" stop-color="#5e5aa3"/>
      <stop offset="100%" stop-color="#f0d39d"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#sky)"/>
  <circle cx="820" cy="160" r="72" fill="#fff1be" opacity="0.9"/>
  <path d="M0 740 C140 690 280 680 420 710 S680 780 840 740 S960 710 1024 730 L1024 1024 L0 1024 Z" fill="#21345d"/>
  <path d="M0 800 C150 760 290 750 420 780 S680 860 840 820 S960 790 1024 808 L1024 1024 L0 1024 Z" fill="#162546" opacity="0.85"/>
  <text x="72" y="110" fill="#fff8ea" font-size="22" font-family="Arial, sans-serif">SPREAD ${spread.sequence} · ${sideLabel}</text>
  <text x="72" y="178" fill="#fffef8" font-size="44" font-family="Georgia, serif" font-weight="700">${title}</text>
  <text x="72" y="234" fill="#fef0c9" font-size="26" font-family="Georgia, serif">${childName}</text>
  <g transform="translate(360 440)">
    <circle cx="152" cy="-60" r="20" fill="#ffebc6"/>
    <rect x="102" y="-38" width="100" height="128" rx="32" fill="#f2ca57"/>
    <rect x="124" y="90" width="24" height="96" rx="12" fill="#94a7d6"/>
    <rect x="158" y="90" width="24" height="96" rx="12" fill="#94a7d6"/>
    <rect x="78" y="-6" width="24" height="80" rx="11" fill="#ffebc6"/>
    <rect x="202" y="-6" width="24" height="80" rx="11" fill="#ffebc6"/>
  </g>
  <text x="72" y="700" fill="#fff8ea" font-size="22" font-family="Arial, sans-serif">Palette: ${escapeXml(clampText(palette, 70))}</text>
  <text x="72" y="746" fill="#fff8ea" font-size="22" font-family="Arial, sans-serif">${sceneBrief}</text>
  <foreignObject x="72" y="784" width="880" height="180">
    <div xmlns="http://www.w3.org/1999/xhtml" style="color:#fff8ea;font-family:Arial,sans-serif;font-size:20px;line-height:1.45;">
      ${pageText}
    </div>
  </foreignObject>
</svg>`;
}

// ---------------------------------------------------------------------------
// OpenAI image generation
// ---------------------------------------------------------------------------

function getPreferredOpenAIImageModels(): string[] {
  const configured = process.env.OPENAI_IMAGE_MODEL?.trim();
  if (configured) return [configured];
  return ["gpt-image-2", "gpt-image-1"];
}

function shouldTryNextImageModel(status: number, bodyText: string): boolean {
  if (!(status === 400 || status === 404)) return false;
  const normalized = bodyText.toLowerCase();
  return (
    normalized.includes("model") ||
    normalized.includes("not found") ||
    normalized.includes("unsupported") ||
    normalized.includes("not available") ||
    normalized.includes("does not exist")
  );
}

class ModerationBlockedError extends Error {
  constructor(model: string) {
    super(`OpenAI moderation blocked image for ${model}`);
    this.name = "ModerationBlockedError";
  }
}

class UnusableGeneratedImageError extends Error {
  constructor(reason: string) {
    super(`Generated image failed quality check: ${reason}`);
    this.name = "UnusableGeneratedImageError";
  }
}

async function assertUsableGeneratedImage(input: Buffer): Promise<void> {
  const { data, info } = await sharp(input)
    .resize(32, 32, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels < 3 || data.length < 3) {
    throw new UnusableGeneratedImageError("image has no RGB pixel data");
  }

  let luminanceTotal = 0;
  let luminanceSquaredTotal = 0;
  let darkPixels = 0;
  let maxLuminance = 0;
  let pixelCount = 0;

  for (let index = 0; index + 2 < data.length; index += info.channels) {
    const luminance =
      0.2126 * data[index]! +
      0.7152 * data[index + 1]! +
      0.0722 * data[index + 2]!;
    luminanceTotal += luminance;
    luminanceSquaredTotal += luminance * luminance;
    if (luminance < 8) darkPixels += 1;
    if (luminance > maxLuminance) maxLuminance = luminance;
    pixelCount += 1;
  }

  if (pixelCount === 0) {
    throw new UnusableGeneratedImageError("image has no readable pixels");
  }

  const meanLuminance = luminanceTotal / pixelCount;
  const variance = luminanceSquaredTotal / pixelCount - meanLuminance ** 2;
  const stddev = Math.sqrt(Math.max(variance, 0));
  const darkPixelRatio = darkPixels / pixelCount;

  if (meanLuminance < 10 && darkPixelRatio > 0.98) {
    throw new UnusableGeneratedImageError("image is almost entirely black");
  }

  if (meanLuminance < 18 && maxLuminance < 32 && stddev < 6) {
    throw new UnusableGeneratedImageError("image is too dark and flat");
  }
}

function parseRetryAfterMs(bodyText: string, headers: Headers): number {
  const retryHeader = headers.get("Retry-After");
  if (retryHeader) {
    const secs = parseFloat(retryHeader);
    if (!isNaN(secs)) return Math.ceil(secs) * 1000;
  }
  const match = bodyText.match(/try again in (\d+(?:\.\d+)?)s/i);
  if (match) return Math.ceil(parseFloat(match[1]!)) * 1000;
  return 15000;
}

async function generateOpenAIImage(input: {
  prompt: string;
  size: "1024x1024";
}): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const models = getPreferredOpenAIImageModels();
  let lastErrorMessage = "Unknown OpenAI image generation error";

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index]!;
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const response = await fetch(
        "https://api.openai.com/v1/images/generations",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            prompt: input.prompt,
            size: input.size,
            output_format: "png",
            quality: "medium",
          }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        lastErrorMessage = `OpenAI image generation failed for ${model}: ${response.status} ${errorBody}`;

        if (response.status === 429 && attempt < MAX_RETRIES - 1) {
          const waitMs = parseRetryAfterMs(errorBody, response.headers);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }

        if (
          response.status === 400 &&
          errorBody.includes("moderation_blocked")
        ) {
          throw new ModerationBlockedError(model);
        }

        const canFallback =
          index < models.length - 1 &&
          shouldTryNextImageModel(response.status, errorBody);
        if (canFallback) break;
        throw new Error(lastErrorMessage);
      }

      const payload = (await response.json()) as {
        data?: Array<{ b64_json?: string }>;
      };

      const base64Image = payload.data?.[0]?.b64_json;
      if (!base64Image) {
        throw new Error(
          `OpenAI image generation returned no image data for ${model}`
        );
      }

      return Buffer.from(base64Image, "base64");
    }
  }

  throw new Error(lastErrorMessage);
}

// ---------------------------------------------------------------------------
// FLUX image generation (fal.ai)
// ---------------------------------------------------------------------------

function getFluxModel(): string {
  return process.env.FLUX_MODEL?.trim() || "fal-ai/flux/dev";
}

// Generate one square image via fal.ai's synchronous endpoint. fal returns a
// hosted image URL which we then download to a Buffer. The NSFW safety checker
// is disabled: this is an author-controlled tool producing wholesome children's
// book art, and the checker throws frequent false positives on innocent scenes
// (the exact problem that made OpenAI unusable here).
async function generateFluxImage(prompt: string): Promise<Buffer> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    throw new Error("FAL_KEY is not configured");
  }

  const model = getFluxModel();
  // schnell caps at 12 steps (default 4); dev supports up to 50.
  const num_inference_steps = model.includes("schnell") ? 4 : 28;
  const MAX_RETRIES = 3;
  let lastErrorMessage = "Unknown FLUX image generation error";

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const response = await fetch(`https://fal.run/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        image_size: "square_hd", // 1024×1024
        num_images: 1,
        output_format: "png",
        enable_safety_checker: false,
        num_inference_steps,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      lastErrorMessage = `FLUX image generation failed for ${model}: ${response.status} ${errorBody.slice(0, 300)}`;

      // Retry transient rate limits / gateway errors.
      if (
        (response.status === 429 || response.status >= 500) &&
        attempt < MAX_RETRIES - 1
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, 4000 * (attempt + 1))
        );
        continue;
      }
      throw new Error(lastErrorMessage);
    }

    const payload = (await response.json()) as {
      images?: Array<{ url?: string }>;
    };
    const imageUrl = payload.images?.[0]?.url;
    if (!imageUrl) {
      throw new Error(`FLUX returned no image for ${model}`);
    }

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(
        `FLUX image download failed: ${imageResponse.status} for ${imageUrl}`
      );
    }
    return Buffer.from(await imageResponse.arrayBuffer());
  }

  throw new Error(lastErrorMessage);
}

// ---------------------------------------------------------------------------
// Recraft image generation (fal.ai)
// ---------------------------------------------------------------------------

// Recraft v3 is purpose-built for illustration and design. Setting style to
// "digital_illustration" locks in a storybook art aesthetic at the model level
// so prompts don't need to describe the rendering style — they can focus purely
// on scene content. Override via RECRAFT_STYLE env var if needed.
async function generateRecrartImage(prompt: string): Promise<Buffer> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) throw new Error("FAL_KEY is not configured");

  const style = process.env.RECRAFT_STYLE?.trim() || "digital_illustration";
  const MAX_RETRIES = 3;
  let lastErrorMessage = "Unknown Recraft image generation error";

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const response = await fetch("https://fal.run/fal-ai/recraft-v3", {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        image_size: "square_hd",
        style,
        n: 1,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      lastErrorMessage = `Recraft image generation failed: ${response.status} ${errorBody.slice(0, 300)}`;

      if (
        (response.status === 429 || response.status >= 500) &&
        attempt < MAX_RETRIES - 1
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, 4000 * (attempt + 1))
        );
        continue;
      }
      throw new Error(lastErrorMessage);
    }

    const payload = (await response.json()) as {
      images?: Array<{ url?: string }>;
    };
    const imageUrl = payload.images?.[0]?.url;
    if (!imageUrl) throw new Error("Recraft returned no image");

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(
        `Recraft image download failed: ${imageResponse.status} for ${imageUrl}`
      );
    }
    return Buffer.from(await imageResponse.arrayBuffer());
  }

  throw new Error(lastErrorMessage);
}

// ---------------------------------------------------------------------------
// Provider dispatch
// ---------------------------------------------------------------------------

// Generate one square base image using the configured provider.
async function generateBaseImage(prompt: string): Promise<Buffer> {
  const provider = getImageProvider();
  if (provider === "flux") return generateFluxImage(prompt);
  if (provider === "recraft") return generateRecrartImage(prompt);
  return generateOpenAIImage({
    prompt,
    size: BOOK_SPEC.coverIllustrationOpenAISize,
  });
}

// Generate and immediately upscale a single square image.
async function generateAndUpscale(prompt: string): Promise<Buffer> {
  const png = await generateBaseImage(prompt);
  await assertUsableGeneratedImage(png);
  return upscaleImageBuffer(png);
}

// ---------------------------------------------------------------------------
// Batch types
// ---------------------------------------------------------------------------

type OpenAIImageBatchRequest = {
  customId: string;
  prompt: string;
  pathname: string;
  size: "1024x1024";
  contentType: "image/png";
};

type OpenAIImageBatchLine = {
  custom_id?: string;
  response?: {
    status_code?: number;
    body?: {
      data?: Array<{ b64_json?: string }>;
    };
  };
  error?: {
    message?: string;
  };
};

type RetrievedOpenAIImageBatch = {
  id: string;
  input_file_id: string;
  output_file_id?: string;
  error_file_id?: string;
  status: OpenAIImageBatchStatus;
  completed_at?: number;
  request_counts?: {
    total?: number;
  };
};

function toOpenAIBatchAsset(
  batch: RetrievedOpenAIImageBatch,
  previous: Pick<
    OpenAIImageBatchAsset,
    "model" | "requestCount" | "submittedAt"
  >
): OpenAIImageBatchAsset {
  return {
    batchId: batch.id,
    inputFileId: batch.input_file_id,
    outputFileId: batch.output_file_id,
    errorFileId: batch.error_file_id,
    status: batch.status,
    model: previous.model,
    requestCount: batch.request_counts?.total ?? previous.requestCount,
    submittedAt: previous.submittedAt,
    lastCheckedAt: new Date().toISOString(),
    completedAt: batch.completed_at
      ? new Date(batch.completed_at * 1000).toISOString()
      : undefined,
  };
}

function assertOpenAIResponse(
  response: Response,
  bodyText: string,
  action: string
) {
  if (!response.ok) {
    const isHtml =
      bodyText.trimStart().startsWith("<") || bodyText.includes("<!DOCTYPE");
    const detail = isHtml ? `HTTP ${response.status}` : bodyText.slice(0, 300);
    throw new Error(`${action} failed: ${detail}`);
  }
}

function getOpenAIImageBatchModel(): string {
  return getPreferredOpenAIImageModels()[0] ?? "gpt-image-2";
}

function requireOpenAIKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return apiKey;
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

const RECRAFT_PROMPT_LIMIT = 950; // hard cap, Recraft rejects > 1000 chars

function capPrompt(prompt: string): string {
  return prompt.length > RECRAFT_PROMPT_LIMIT
    ? prompt.slice(0, RECRAFT_PROMPT_LIMIT - 1).trimEnd()
    : prompt;
}

// Recraft has a 1000-char prompt limit, so we build a compact version that
// prioritises scene content. The illustration style is handled by the model's
// `style` parameter, so we don't need to describe it in the prompt.
function buildRecrartPagePrompt(input: {
  profile: ChildProfile;
  characterBible: CharacterBible;
  spread: BookSpread;
  side: "left" | "right";
}): string {
  const { profile, characterBible, spread, side } = input;

  const compositionVariants = [
    "wide establishing shot",
    "medium shot at eye level",
    "close-up on face and hands",
    "low-angle view",
    "bird's-eye view",
    "three-quarter angle",
    "over-the-shoulder view",
    "silhouette against lit background",
  ];
  const compositionIdx =
    (spread.sequence * 2 + (side === "right" ? 1 : 0)) %
    compositionVariants.length;
  const compositionHint = compositionVariants[compositionIdx];

  // First sentence of each bible field keeps the character readable but short.
  const appearance =
    characterBible.childAppearance.split(".")[0]?.trim() ??
    characterBible.childAppearance;
  const outfit =
    characterBible.outfitRules.split(".")[0]?.trim() ??
    characterBible.outfitRules;
  const companions = characterBible.companionCharacters.slice(0, 2).join(", ");

  const parts = [
    spread.illustrationPrompt,
    spread.sceneBrief,
    `${profile.name}: ${appearance.slice(0, 100)}.`,
    `Outfit: ${outfit.slice(0, 80)}.`,
    companions ? `With: ${companions}.` : "",
    `Palette: ${characterBible.palette.slice(0, 60)}.`,
    `Composition: ${compositionHint}.`,
    "Warm children's picture book. No text in image.",
  ];

  return capPrompt(parts.filter(Boolean).join(" "));
}

function buildRecrartCoverPrompt(input: {
  story: Story;
  profile: ChildProfile;
  characterBible: CharacterBible;
  coverSpread?: BookSpread;
}): string {
  const { story, profile, characterBible, coverSpread } = input;

  const sceneDirection =
    coverSpread?.illustrationPrompt ??
    `Front cover for "${story.title}" starring ${profile.name}.`;
  const appearance =
    characterBible.childAppearance.split(".")[0]?.trim() ??
    characterBible.childAppearance;
  const companions = characterBible.companionCharacters.slice(0, 2).join(", ");

  const parts = [
    sceneDirection,
    `${profile.name}: ${appearance.slice(0, 100)}.`,
    companions ? `With: ${companions}.` : "",
    `Palette: ${characterBible.palette.slice(0, 60)}.`,
    `Book: "${story.title}". Children's picture book front cover. Warm bedtime feeling. No text in image.`,
  ];

  return capPrompt(parts.filter(Boolean).join(" "));
}

function buildPageIllustrationPrompt(input: {
  project: BookProject;
  story: Story;
  profile: ChildProfile;
  characterBible: CharacterBible;
  spread: BookSpread;
  side: "left" | "right";
  omitPageText?: boolean;
}): string {
  if (getImageProvider() === "recraft") {
    return buildRecrartPagePrompt(input);
  }

  const {
    project,
    story,
    profile,
    characterBible,
    spread,
    side,
    omitPageText = false,
  } = input;
  const pageText = side === "left" ? spread.leftPageText : spread.rightPageText;

  const compositionVariants = [
    "wide establishing shot showing the full environment",
    "medium shot at the character's eye level",
    "close-up on face and hands capturing expression and action",
    "low-angle looking up at the character",
    "bird's-eye overview of the scene",
    "three-quarter angle, mid-distance",
    "over-the-shoulder perspective",
    "silhouette against a lit background",
  ];
  const compositionIdx =
    (spread.sequence * 2 + (side === "right" ? 1 : 0)) %
    compositionVariants.length;
  const compositionHint = compositionVariants[compositionIdx];

  return [
    // Scene-specific content leads so FLUX weights the narrative moment first.
    `Illustration direction: ${spread.illustrationPrompt}.`,
    `Scene brief: ${spread.sceneBrief}.`,
    ...(omitPageText ? [] : pageText ? [`Page moment: ${pageText}.`] : []),
    `Composition: ${compositionHint}.`,
    // Character consistency follows as a constraint block.
    buildIllustrationDirection(characterBible),
    // Metadata.
    `Book title: ${story.title}.`,
    `Main child: ${profile.name}.`,
    `Age band: ${project.ageBand}.`,
    `Spread sequence: ${spread.sequence}, ${side} page.`,
    // Variation is the critical instruction — stated explicitly.
    "Illustrate this specific story moment. The depicted scene, character action, setting detail, and emotional tone must match the illustration direction above. This image must look meaningfully different from every other page in the book. Keep only the child's face shape, hair colour, skin tone, and core outfit exactly consistent. No text, lettering, or page numbers inside the art.",
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Spread/cover image helpers
// ---------------------------------------------------------------------------

function replaceCoverSpreadImage(
  spreads: BookSpread[],
  coverImageUrl: string
): BookSpread[] {
  return spreads.map((spread) =>
    spread.sequence === 1 || spread.title === "Cover"
      ? {
          ...spread,
          imageUrl: coverImageUrl,
          thumbnailUrl: coverImageUrl,
        }
      : spread
  );
}

function replaceSpreadImage(
  spreads: BookSpread[],
  nextSpread: BookSpread
): BookSpread[] {
  return spreads.map((spread) =>
    spread.id === nextSpread.id ? nextSpread : spread
  );
}

export function applySpreadIllustration(
  spreads: BookSpread[],
  nextSpread: BookSpread
): BookSpread[] {
  return replaceSpreadImage(spreads, nextSpread);
}

// ---------------------------------------------------------------------------
// Batch submission and retrieval
// ---------------------------------------------------------------------------

// Build one cover request + two per-page requests (left + right) for every
// non-cover spread. Each interior page gets its own independent illustration.
export function buildBookImageBatchRequests(input: {
  project: BookProject;
  story: Story;
  profile: ChildProfile;
  characterBible: CharacterBible;
}): OpenAIImageBatchRequest[] {
  const coverSpread = getCoverSpread(input.project.spreads);
  const requests: OpenAIImageBatchRequest[] = [
    {
      customId: "cover",
      prompt: buildCoverIllustrationPrompt({ ...input, coverSpread }),
      pathname: `books/${input.project.id}/cover.png`,
      size: BOOK_SPEC.coverIllustrationOpenAISize,
      contentType: "image/png",
    },
  ];

  for (const spread of input.project.spreads) {
    if (spread.sequence === 1 || spread.title === "Cover") continue;
    const base = `books/${input.project.id}/spreads/${spread.sequence}`;
    requests.push(
      {
        customId: `spread:${spread.id}:left`,
        prompt: buildPageIllustrationPrompt({
          ...input,
          spread,
          side: "left",
          // Raw story prose in an image prompt is a common moderation trigger and
          // shouldn't be rendered into the art anyway — the scene brief and
          // illustration direction already carry the visual intent.
          omitPageText: true,
        }),
        pathname: `${base}-left.png`,
        size: BOOK_SPEC.interiorIllustrationOpenAISize,
        contentType: "image/png",
      },
      {
        customId: `spread:${spread.id}:right`,
        prompt: buildPageIllustrationPrompt({
          ...input,
          spread,
          side: "right",
          omitPageText: true,
        }),
        pathname: `${base}-right.png`,
        size: BOOK_SPEC.interiorIllustrationOpenAISize,
        contentType: "image/png",
      }
    );
  }

  return requests;
}

export async function submitBookImageBatch(input: {
  project: BookProject;
  story: Story;
  profile: ChildProfile;
  characterBible: CharacterBible;
}): Promise<OpenAIImageBatchAsset> {
  const apiKey = requireOpenAIKey();
  const model = getOpenAIImageBatchModel();
  const requests = buildBookImageBatchRequests(input);
  const jsonl = requests
    .map((request) =>
      JSON.stringify({
        custom_id: request.customId,
        method: "POST",
        url: "/v1/images/generations",
        body: {
          model,
          prompt: request.prompt,
          size: request.size,
          output_format: "png",
          quality: "medium",
        },
      })
    )
    .join("\n");

  const form = new FormData();
  form.append("purpose", "batch");
  form.append(
    "file",
    new Blob([`${jsonl}\n`], { type: "application/jsonl" }),
    `book-${input.project.id}-images.jsonl`
  );

  const uploadResponse = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });
  const uploadBody = await uploadResponse.text();
  assertOpenAIResponse(uploadResponse, uploadBody, "OpenAI batch input upload");
  const uploadPayload = JSON.parse(uploadBody) as { id?: string };
  if (!uploadPayload.id) {
    throw new Error("OpenAI batch input upload returned no file id");
  }

  const batchResponse = await fetch("https://api.openai.com/v1/batches", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input_file_id: uploadPayload.id,
      endpoint: "/v1/images/generations",
      completion_window: "24h",
      metadata: {
        bookProjectId: input.project.id,
        sourceStoryId: input.project.sourceStoryId,
      },
    }),
  });
  const batchBody = await batchResponse.text();
  assertOpenAIResponse(batchResponse, batchBody, "OpenAI image batch creation");
  const batch = JSON.parse(batchBody) as RetrievedOpenAIImageBatch;

  return {
    batchId: batch.id,
    inputFileId: uploadPayload.id,
    outputFileId: batch.output_file_id,
    errorFileId: batch.error_file_id,
    status: batch.status,
    model,
    requestCount: requests.length,
    submittedAt: new Date().toISOString(),
  };
}

export async function retrieveBookImageBatch(
  asset: OpenAIImageBatchAsset
): Promise<OpenAIImageBatchAsset> {
  const apiKey = requireOpenAIKey();
  const response = await fetch(
    `https://api.openai.com/v1/batches/${asset.batchId}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );
  const body = await response.text();
  assertOpenAIResponse(response, body, "OpenAI image batch retrieve");
  return toOpenAIBatchAsset(
    JSON.parse(body) as RetrievedOpenAIImageBatch,
    asset
  );
}

export async function downloadBookImageBatchOutput(
  asset: OpenAIImageBatchAsset
): Promise<string> {
  if (!asset.outputFileId) {
    throw new Error("OpenAI image batch completed without an output file");
  }

  const apiKey = requireOpenAIKey();
  const response = await fetch(
    `https://api.openai.com/v1/files/${asset.outputFileId}/content`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );
  const body = await response.text();
  assertOpenAIResponse(response, body, "OpenAI image batch output download");
  return body;
}

function parseOpenAIImageBatchOutput(outputText: string): Map<string, Buffer> {
  const images = new Map<string, Buffer>();
  for (const rawLine of outputText.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const parsed = JSON.parse(line) as OpenAIImageBatchLine;
    const customId = parsed.custom_id;
    const base64Image = parsed.response?.body?.data?.[0]?.b64_json;
    if (!customId || !base64Image) continue;
    images.set(customId, Buffer.from(base64Image, "base64"));
  }

  return images;
}

export async function applyBookImageBatchOutput(input: {
  project: BookProject;
  story: Story;
  profile: ChildProfile;
  characterBible: CharacterBible;
  outputText: string;
}): Promise<{
  coverImageUrl: string;
  spreads: BookSpread[];
  provider: "openai" | "mixed";
}> {
  const requests = buildBookImageBatchRequests(input);
  const images = parseOpenAIImageBatchOutput(input.outputText);
  const spreadById = new Map(
    input.project.spreads.map((spread) => [spread.id, spread] as const)
  );

  // The batch API can silently drop individual images that hit moderation or a
  // transient error. Recover each missing image on its own; if that one image
  // is still blocked, mark only that page as failed so it can be retried.
  let failedCount = 0;

  const resolveImageBuffer = async (
    request: OpenAIImageBatchRequest
  ): Promise<Buffer> => {
    const generated = images.get(request.customId);
    if (generated) {
      try {
        await assertUsableGeneratedImage(generated);
        return upscaleImageBuffer(generated);
      } catch (err) {
        if (!(err instanceof UnusableGeneratedImageError)) throw err;
        console.warn(
          `Batch image ${request.customId} failed quality checks (${err.message}) — regenerating it.`
        );
      }
    }

    // Missing from the batch — try one synchronous regeneration.
    try {
      return await generateAndUpscale(request.prompt);
    } catch (err) {
      throw err;
    }
  };

  const storeResolved = async (request: OpenAIImageBatchRequest) => {
    const buffer = await resolveImageBuffer(request);
    return storeBookAsset({
      pathname: request.pathname,
      body: buffer,
      contentType: "image/png",
    });
  };

  const storePageResolved = async (request: OpenAIImageBatchRequest) => {
    try {
      return { url: await storeResolved(request), error: undefined };
    } catch (err) {
      failedCount += 1;
      return {
        url: undefined,
        error: getImageFailureMessage(err),
      };
    }
  };

  const coverRequest = requests.find((request) => request.customId === "cover");
  if (!coverRequest) {
    throw new Error("OpenAI image batch had no cover request");
  }

  const coverImageUrl = await storeResolved(coverRequest);
  let spreads = replaceCoverSpreadImage(input.project.spreads, coverImageUrl);

  for (const spread of input.project.spreads) {
    if (spread.sequence === 1 || spread.title === "Cover") continue;

    const leftRequest = requests.find(
      (r) => r.customId === `spread:${spread.id}:left`
    );
    const rightRequest = requests.find(
      (r) => r.customId === `spread:${spread.id}:right`
    );
    if (!leftRequest || !rightRequest) continue;

    const left = await storePageResolved(leftRequest);
    const right = await storePageResolved(rightRequest);

    spreads = replaceSpreadImage(spreads, {
      ...spread,
      leftPageImageUrl: left.url,
      rightPageImageUrl: right.url,
      leftPageImageError: left.error,
      rightPageImageError: right.error,
      thumbnailUrl: left.url ?? spread.thumbnailUrl,
    });
  }

  return {
    coverImageUrl,
    spreads,
    provider: failedCount > 0 ? "mixed" : "openai",
  };
}

// ---------------------------------------------------------------------------
// Public generation functions (used by the sequential / non-batch path)
// ---------------------------------------------------------------------------

export async function generateCoverIllustration(input: {
  project: BookProject;
  story: Story;
  profile: ChildProfile;
  characterBible: CharacterBible;
}): Promise<{
  coverImageUrl: string;
  spreads: BookSpread[];
  provider: "openai" | "placeholder";
}> {
  const coverSpread = getCoverSpread(input.project.spreads);
  const prompt = buildCoverIllustrationPrompt({ ...input, coverSpread });

  if (isGeneratedIllustrationConfigured()) {
    try {
      let upscaled: Buffer;
      try {
        upscaled = await generateAndUpscale(prompt);
      } catch (err) {
        if (!(err instanceof UnusableGeneratedImageError)) throw err;
        console.warn(`${err.message} — retrying cover generation once.`);
        upscaled = await generateAndUpscale(prompt);
      }

      const coverImageUrl = await storeBookAsset({
        pathname: `books/${input.project.id}/cover.png`,
        body: upscaled,
        contentType: "image/png",
      });

      return {
        coverImageUrl,
        spreads: replaceCoverSpreadImage(input.project.spreads, coverImageUrl),
        provider: "openai",
      };
    } catch (err) {
      throw err;
    }
  }

  const svg = createPlaceholderCoverSvg(input);
  const coverImageUrl = await storeBookAsset({
    pathname: `books/${input.project.id}/cover.svg`,
    body: svg,
    contentType: "image/svg+xml",
  });

  return {
    coverImageUrl,
    spreads: replaceCoverSpreadImage(input.project.spreads, coverImageUrl),
    provider: "placeholder",
  };
}

export async function generateSpreadPageIllustration(input: {
  project: BookProject;
  story: Story;
  profile: ChildProfile;
  characterBible: CharacterBible;
  spread: BookSpread;
  side: "left" | "right";
}): Promise<{ url: string; provider: "openai" | "placeholder" }> {
  const { project, spread, side } = input;
  const suffix = side === "left" ? "-left" : "-right";
  const base = `books/${project.id}/spreads/${spread.sequence}`;

  const storePlaceholderPage = async () => {
    const svg = createPlaceholderPageSvg(input);
    return storeBookAsset({
      pathname: `${base}${suffix}.svg`,
      body: svg,
      contentType: "image/svg+xml",
    });
  };

  if (!isGeneratedIllustrationConfigured()) {
    return { url: await storePlaceholderPage(), provider: "placeholder" };
  }

  const prompt = buildPageIllustrationPrompt(input);

  try {
    let upscaled: Buffer;
    try {
      upscaled = await generateAndUpscale(prompt);
    } catch (err) {
      if (!(err instanceof UnusableGeneratedImageError)) throw err;
      console.warn(
        `${err.message} — retrying spread ${spread.sequence} ${side} page once.`
      );
      upscaled = await generateAndUpscale(prompt);
    }
    const url = await storeBookAsset({
      pathname: `${base}${suffix}.png`,
      body: upscaled,
      contentType: "image/png",
    });
    return { url, provider: "openai" };
  } catch (err) {
    if (
      !(err instanceof ModerationBlockedError) &&
      !(err instanceof UnusableGeneratedImageError)
    ) {
      throw err;
    }
    // Retry without page text — the text is the most common moderation trigger.
    const fallbackPrompt = buildPageIllustrationPrompt({
      ...input,
      omitPageText: true,
    });
    try {
      const upscaled = await generateAndUpscale(fallbackPrompt);
      const url = await storeBookAsset({
        pathname: `${base}${suffix}.png`,
        body: upscaled,
        contentType: "image/png",
      });
      return { url, provider: "openai" };
    } catch (fallbackErr) {
      if (
        !(fallbackErr instanceof ModerationBlockedError) &&
        !(fallbackErr instanceof UnusableGeneratedImageError)
      ) {
        throw fallbackErr;
      }
      throw fallbackErr;
    }
  }
}

function getImageFailureMessage(err: unknown) {
  return err instanceof Error ? err.message : "Image generation failed.";
}

export async function generateSpreadIllustration(input: {
  project: BookProject;
  story: Story;
  profile: ChildProfile;
  characterBible: CharacterBible;
  spread: BookSpread;
}): Promise<{ spread: BookSpread; provider: "openai" | "placeholder" }> {
  const { spread } = input;
  // Generate left and right page images sequentially to stay within rate limits.
  const nextSpread: BookSpread = { ...spread };
  const providers: Array<"openai" | "placeholder"> = [];

  try {
    const left = await generateSpreadPageIllustration({
      ...input,
      side: "left",
    });
    nextSpread.leftPageImageUrl = left.url;
    nextSpread.thumbnailUrl = left.url;
    nextSpread.leftPageImageError = undefined;
    providers.push(left.provider);
  } catch (err) {
    nextSpread.leftPageImageError = getImageFailureMessage(err);
  }

  try {
    const right = await generateSpreadPageIllustration({
      ...input,
      side: "right",
    });
    nextSpread.rightPageImageUrl = right.url;
    nextSpread.rightPageImageError = undefined;
    providers.push(right.provider);
  } catch (err) {
    nextSpread.rightPageImageError = getImageFailureMessage(err);
  }

  return {
    spread: nextSpread,
    provider:
      providers.length === 2 &&
      providers.every((provider) => provider === "openai")
        ? "openai"
        : "placeholder",
  };
}
