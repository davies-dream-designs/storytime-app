import sharp from "sharp";
import type { ChildProfile, Story } from "@/types";
import { AppError } from "@/lib/errors";
import type {
  BookProject,
  BookSpread,
  CharacterBible,
  CharacterVisualReference,
  ContinuityVisualReference,
  IllustrationGenerationMetadata,
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

function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

// True when the provider has its credentials AND blob storage is ready.
export function isGeneratedIllustrationConfigured(): boolean {
  return isBookAssetStorageConfigured() && isOpenAIConfigured();
}

// How many spreads to illustrate concurrently per cursor step.
// Default 3 - safe for Tier 2+ (10 RPM). Raise via ILLUSTRATION_CONCURRENCY:
//   Tier 3 (50 RPM):  5
//   Tier 4 (100 RPM): 10+
export function getIllustrationConcurrency(): number {
  const val = parseInt(process.env.ILLUSTRATION_CONCURRENCY ?? "3", 10);
  return isNaN(val) || val < 1 ? 3 : Math.min(val, 20);
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

// Downsample to a web-friendly 1024×1024 JPEG (~150-300 KB) for the book
// reader. The print PNG is kept separately for PDF/Lulu use.
async function webImageBuffer(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize(1024, 1024, { kernel: sharp.kernel.lanczos3, fit: "fill" })
    .jpeg({ quality: 88, mozjpeg: true })
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
  omitSceneDetails?: boolean;
}): string {
  const { story, profile, characterBible, coverSpread } = input;

  if (input.omitSceneDetails) {
    // Simplified fallback used when the full prompt is moderation-blocked.
    return [
      `Book title: ${story.title}.`,
      `A personalised bedtime story for ${profile.name}.`,
      `Age band: ${input.project.ageBand}.`,
      `Theme: ${story.theme || "gentle bedtime adventure"}.`,
      "Create a square children's picture-book front cover with a warm, gentle bedtime illustration style.",
      "Do not render any visible publisher logo or extra text into the art itself.",
    ].join(" ");
  }

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
  visualReferences?: CharacterVisualReference[];
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

const MAX_VISUAL_REFERENCES_PER_IMAGE = 6;
const MAX_CONTINUITY_REFERENCES_PER_IMAGE = 3;

type ImageConditionReference =
  | ({ kind: "character" } & CharacterVisualReference)
  | ({ kind: "continuity" } & ContinuityVisualReference);

async function loadReferenceImageBuffer(input: {
  id: string;
  imageUrl: string;
  kind: "character" | "continuity";
}): Promise<Buffer | null> {
  try {
    const response = await fetch(input.imageUrl);
    if (!response.ok) return null;
    const source = Buffer.from(await response.arrayBuffer());
    return sharp(source)
      .rotate()
      .resize(384, 384, {
        fit: "cover",
        position: "attention",
      })
      .png({ compressionLevel: 8 })
      .toBuffer();
  } catch (error) {
    console.warn("Could not load illustration conditioning reference.", {
      referenceId: input.id,
      referenceKind: input.kind,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function buildIllustrationConditioningSheet(input: {
  visualReferences?: CharacterVisualReference[];
  continuityReferences?: ContinuityVisualReference[];
}): Promise<{
  image: Buffer;
  visualReferences: CharacterVisualReference[];
  continuityReferences: ContinuityVisualReference[];
} | null> {
  const selectedCharacters = (input.visualReferences ?? [])
    .filter((reference) => reference.imageUrl)
    .slice(0, MAX_VISUAL_REFERENCES_PER_IMAGE);
  const selectedContinuity = (input.continuityReferences ?? [])
    .filter((reference) => reference.imageUrl)
    .slice(0, MAX_CONTINUITY_REFERENCES_PER_IMAGE);
  const selected: ImageConditionReference[] = [
    ...selectedCharacters.map((reference) => ({
      ...reference,
      kind: "character" as const,
    })),
    ...selectedContinuity.map((reference) => ({
      ...reference,
      kind: "continuity" as const,
    })),
  ];
  if (selected.length === 0) return null;

  const loaded = await Promise.all(
    selected.map(async (reference) => ({
      reference,
      image: await loadReferenceImageBuffer(reference),
    }))
  );
  const usable = loaded.filter(
    (
      item
    ): item is { reference: ImageConditionReference; image: Buffer } =>
      Boolean(item.image)
  );
  if (usable.length === 0) return null;

  const cellSize = 384;
  const columns = Math.min(3, usable.length);
  const rows = Math.ceil(usable.length / columns);
  const image = await sharp({
    create: {
      width: columns * cellSize,
      height: rows * cellSize,
      channels: 3,
      background: "#fff8ea",
    },
  })
    .composite(
      usable.map((item, index) => ({
        input: item.image,
        left: (index % columns) * cellSize,
        top: Math.floor(index / columns) * cellSize,
      }))
    )
    .png({ compressionLevel: 8 })
    .toBuffer();

  return {
    image,
    visualReferences: usable
      .filter(
        (
          item
        ): item is {
          reference: CharacterVisualReference & { kind: "character" };
          image: Buffer;
        } => item.reference.kind === "character"
      )
      .map((item) => {
        const { kind: _kind, ...reference } = item.reference;
        return reference;
      }),
    continuityReferences: usable
      .filter(
        (
          item
        ): item is {
          reference: ContinuityVisualReference & { kind: "continuity" };
          image: Buffer;
        } => item.reference.kind === "continuity"
      )
      .map((item) => {
        const { kind: _kind, ...reference } = item.reference;
        return reference;
      }),
  };
}

function buildVisualReferencePrompt(input: {
  visualReferences?: CharacterVisualReference[];
  continuityReferences?: ContinuityVisualReference[];
}): string {
  const referenceList = (input.visualReferences ?? [])
    .map((reference, index) => {
      const relationship = reference.relationship
        ? `, ${reference.relationship}`
        : "";
      const appearance = reference.appearance
        ? `: ${reference.appearance}`
        : "";
      const staleNote = reference.isStale
        ? " [reference image may be stale: use face identity only; latest text controls body, age, hair, outfit, and other changeable traits]"
        : "";
      return `${index + 1}. ${reference.name} (${reference.role}${relationship})${staleNote}${appearance}`;
    })
    .join(" ");
  const continuityList = (input.continuityReferences ?? [])
    .map((reference, index) => `${index + 1}. ${reference.label}`)
    .join(" ");

  return [
    referenceList
      ? `Attached character reference sheet order: ${referenceList}`
      : "",
    continuityList
      ? `Attached approved continuity art sheet order: ${continuityList}`
      : "",
    referenceList || continuityList
      ? "Use the attached reference sheet only for likeness and continuity; do not copy its crop, plain background, portrait pose, or sheet layout."
      : "",
    referenceList
      ? "When a selected child, family member, friend, or pet appears, match the reference image for identity only: recognisable face, skin tone, and familiar markings."
      : "",
    referenceList
      ? "If a reference is marked stale, do not preserve body size, hairstyle, outfit, apparent age, pose, or clothing from that image; preserve only core facial identity and follow the latest text."
      : "",
    referenceList
      ? "Latest edited profile/reference text controls changeable visual traits including hair length, hairstyle, facial hair, glasses, outfit, body build, and apparent age. If latest text conflicts with the attached image or older generated image, change the artwork to match the latest text while keeping the person recognisable."
      : "",
    referenceList
      ? "Body build is controlled by the latest profile/reference text. If that latest body-build text conflicts with the attached image or an older generated image, change the figure silhouette and proportions to match the latest body-build text while keeping the face recognisable."
      : "",
    referenceList
      ? "If latest body build is Large, draw a moderately fuller-than-average person, not a very large or oversized person. If an attached reference image shows a much larger body than the latest Large cue, reduce the body size in the new artwork and preserve identity through face, hair, glasses, skin tone, and expression."
      : "",
    referenceList
      ? "Only use a very large plus-size silhouette when the latest profile/reference text explicitly says Very Large."
      : "",
    referenceList
      ? "Do not make grandparents generically older, thinner, heavier, or frailer than their latest profile/reference details."
      : "",
    continuityList
      ? "Use approved continuity art only to preserve recurring outfit colours, key props, companion markings, and broad location continuity across spreads. Do not repeat the exact composition, angle, pose, or page layout from continuity art."
      : "",
    "Do not add written labels, captions, names, numbers, watermarks, or relationship words to the artwork.",
  ]
    .filter(Boolean)
    .join(" ");
}

async function buildOpenAIImageEditBody(input: {
  model: string;
  prompt: string;
  size: "1024x1024";
  visualReferences?: CharacterVisualReference[];
  continuityReferences?: ContinuityVisualReference[];
}): Promise<FormData> {
  const sheet = await buildIllustrationConditioningSheet({
    visualReferences: input.visualReferences,
    continuityReferences: input.continuityReferences,
  });
  if (!sheet) {
    throw new AppError("book.reference_image_unavailable", {
      message: "No usable reference images could be loaded.",
    });
  }

  const imageArrayBuffer = sheet.image.buffer.slice(
    sheet.image.byteOffset,
    sheet.image.byteOffset + sheet.image.byteLength
  ) as ArrayBuffer;
  const formData = new FormData();
  formData.append(
    "image",
    new File([imageArrayBuffer], "storycot-illustration-references.png", {
      type: "image/png",
    })
  );
  formData.append("model", input.model);
  formData.append(
    "prompt",
    [
      buildVisualReferencePrompt({
        visualReferences: sheet.visualReferences,
        continuityReferences: sheet.continuityReferences,
      }),
      input.prompt,
    ]
      .filter(Boolean)
      .join(" ")
  );
  formData.append("size", input.size);
  formData.append("quality", "medium");
  return formData;
}

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

class ModerationBlockedError extends AppError {
  constructor(model: string) {
    super("book.image_moderation_blocked", {
      message: `OpenAI moderation blocked image for ${model}`,
      context: { model },
    });
    this.name = "ModerationBlockedError";
  }
}

class UnusableGeneratedImageError extends AppError {
  constructor(reason: string) {
    super("book.image_unusable", {
      message: `Generated image failed quality check: ${reason}`,
      context: { reason },
    });
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
  visualReferences?: CharacterVisualReference[];
  continuityReferences?: ContinuityVisualReference[];
}): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AppError("system.config_missing", {
      message: "OPENAI_API_KEY is not configured",
    });
  }

  const models = getPreferredOpenAIImageModels();
  let lastErrorMessage = "Unknown OpenAI image generation error";

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index]!;
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const useConditioningReferences = Boolean(
        input.visualReferences?.length || input.continuityReferences?.length
      );
      const body = useConditioningReferences
        ? await buildOpenAIImageEditBody({
            model,
            prompt: input.prompt,
            size: input.size,
            visualReferences: input.visualReferences,
            continuityReferences: input.continuityReferences,
          })
        : JSON.stringify({
            model,
            prompt: input.prompt,
            size: input.size,
            output_format: "png",
            quality: "medium",
          });
      const response = await fetch(
        useConditioningReferences
          ? "https://api.openai.com/v1/images/edits"
          : "https://api.openai.com/v1/images/generations",
        {
          method: "POST",
          headers: useConditioningReferences
            ? { Authorization: `Bearer ${apiKey}` }
            : {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
          body,
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
        throw new AppError(
          response.status === 429
            ? "book.image_rate_limited"
            : "external.openai_error",
          {
            message: lastErrorMessage,
            context: { model, status: response.status },
          }
        );
      }

      const payload = (await response.json()) as {
        data?: Array<{ b64_json?: string }>;
      };

      const base64Image = payload.data?.[0]?.b64_json;
      if (!base64Image) {
        throw new AppError("external.openai_error", {
          message: `OpenAI image generation returned no image data for ${model}`,
          context: { model },
        });
      }

      return Buffer.from(base64Image, "base64");
    }
  }

  throw new AppError("external.openai_error", { message: lastErrorMessage });
}

// ---------------------------------------------------------------------------
// Provider dispatch
// ---------------------------------------------------------------------------

async function generateBaseImage(input: {
  prompt: string;
  visualReferences?: CharacterVisualReference[];
  continuityReferences?: ContinuityVisualReference[];
}): Promise<Buffer> {
  if (input.visualReferences?.length || input.continuityReferences?.length) {
    try {
      return await generateOpenAIImage({
        prompt: input.prompt,
        size: BOOK_SPEC.coverIllustrationOpenAISize,
        visualReferences: input.visualReferences,
        continuityReferences: input.continuityReferences,
      });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      if (error.code !== "book.reference_image_unavailable") throw error;
      console.warn(
        "Reference images were unavailable; falling back to text-only generation."
      );
    }
  }

  return generateOpenAIImage({
    prompt: input.prompt,
    size: BOOK_SPEC.coverIllustrationOpenAISize,
  });
}

// Generate and immediately upscale a single square image.
async function generateAndUpscale(input: {
  prompt: string;
  visualReferences?: CharacterVisualReference[];
  continuityReferences?: ContinuityVisualReference[];
}): Promise<Buffer> {
  const png = await generateBaseImage(input);
  await assertUsableGeneratedImage(png);
  return upscaleImageBuffer(png);
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function sanitizePageMomentForImagePrompt(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\b(bare\s+(?:little\s+)?toes?|bare\s+feet|feet|toes?)\b/gi, "shoes")
    .replace(/\b(warm\s+mud|muddy\s+skin|mud\s+on\s+(?:their|his|her)\s+body)\b/gi, "soft ground")
    .replace(/\b(naked|nude|undressed|underwear|nappy|diaper)\b/gi, "fully clothed")
    .replace(/\b(bath|bathing|toilet|potty)\b/gi, "bedtime room")
    .replace(/\b(injured|injury|blood|weapon|knife|gun|drowning|restraint|restrained)\b/gi, "safe")
    .slice(0, 420)
    .trim();
}

function getIllustratedSpreadMomentText(
  spread: BookSpread,
  side: "left" | "right"
): string {
  if (side === "right") return spread.rightPageText;

  return [spread.leftPageText, spread.rightPageText]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
}

const RELATIONSHIP_REFERENCE_HINTS: Record<string, string[]> = {
  mum: ["mum", "mom", "mother", "mama"],
  dad: ["dad", "father", "dada", "papa"],
  parent: ["parent", "grown-up", "adult"],
  grandparent: [
    "grandparent",
    "grandma",
    "grandpa",
    "nan",
    "nana",
    "pop",
    "grandad",
    "granddad",
  ],
  great_grandparent: ["great grandparent", "great grandma", "great grandpa"],
  auntie: ["auntie", "aunty", "aunt"],
  uncle: ["uncle"],
  cousin: ["cousin"],
  sibling: ["sibling", "brother", "sister"],
  friend: ["friend", "pal", "buddy"],
  carer: ["carer", "caregiver"],
  babysitter: ["babysitter", "sitter"],
  neighbour: ["neighbour", "neighbor"],
  teacher: ["teacher"],
  pet: ["pet", "puppy", "dog", "kitten", "cat"],
  other: [],
};

function normalizeReferenceSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getReferenceSearchTerms(reference: CharacterVisualReference): string[] {
  const terms = [normalizeReferenceSearchText(reference.name)];
  const relationship = normalizeReferenceSearchText(reference.relationship ?? "");
  if (relationship) {
    terms.push(relationship);
    terms.push(
      ...(RELATIONSHIP_REFERENCE_HINTS[
        relationship.replace(/\s+/g, "_")
      ] ?? [])
    );
  }
  return Array.from(new Set(terms.filter(Boolean)));
}

function selectSpreadVisualReferences(
  spread: BookSpread,
  references: CharacterVisualReference[] = []
): CharacterVisualReference[] {
  if (references.length === 0) return [];

  const haystack = normalizeReferenceSearchText(
    [
      spread.leftPageText,
      spread.rightPageText,
      spread.sceneBrief,
      spread.illustrationPrompt,
    ].join(" ")
  );

  const selected = references.filter((reference) => {
    if (reference.role === "main_child") return true;
    return getReferenceSearchTerms(reference).some(
      (term) => term && haystack.includes(term)
    );
  });

  const fallback =
    selected.length > 0
      ? selected
      : references.filter((reference) => reference.role === "main_child");

  return fallback.slice(0, MAX_VISUAL_REFERENCES_PER_IMAGE);
}

function isPlaceholderReferenceImageUrl(url?: string): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return lower.startsWith("data:image/svg") || lower.endsWith(".svg");
}

function selectContinuityVisualReferences(input: {
  project: BookProject;
  spread: BookSpread;
}): ContinuityVisualReference[] {
  const continuity: ContinuityVisualReference[] = [];
  const { project, spread } = input;

  if (!isPlaceholderReferenceImageUrl(project.assets.coverImageUrl)) {
    continuity.push({
      id: `cover:${project.id}`,
      label: "Approved cover art",
      imageUrl: project.assets.coverImageUrl!,
      source: "cover",
      sequence: 1,
    });
  }

  const priorSpreads = project.spreads
    .filter(
      (candidate) =>
        candidate.sequence < spread.sequence &&
        candidate.sequence > 1 &&
        candidate.title !== "Cover" &&
        !isPlaceholderReferenceImageUrl(
          candidate.leftPageImageUrl ?? candidate.imageUrl ?? candidate.thumbnailUrl
        )
    )
    .sort((a, b) => b.sequence - a.sequence)
    .slice(0, 2)
    .reverse();

  continuity.push(
    ...priorSpreads.map((candidate) => ({
      id: `spread:${candidate.id}`,
      label: `Approved spread ${candidate.sequence}`,
      imageUrl:
        candidate.leftPageImageUrl ?? candidate.imageUrl ?? candidate.thumbnailUrl!,
      source: "spread" as const,
      sequence: candidate.sequence,
    }))
  );

  return continuity.slice(0, 3);
}

function buildIllustrationQaMetadata(input: {
  provider: "openai" | "placeholder";
  characterReferences: CharacterVisualReference[];
  continuityReferences: ContinuityVisualReference[];
  referenceSnapshotKey?: string;
  correctionNote?: string;
  pageTextOmitted?: boolean;
}): IllustrationGenerationMetadata {
  return {
    provider: input.provider,
    generatedAt: new Date().toISOString(),
    referenceSnapshotKey: input.referenceSnapshotKey,
    characterReferenceIds: input.characterReferences.map((reference) => reference.id),
    characterReferenceNames: input.characterReferences.map(
      (reference) => reference.name
    ),
    continuityReferenceIds: input.continuityReferences.map(
      (reference) => reference.id
    ),
    continuityReferenceLabels: input.continuityReferences.map(
      (reference) => reference.label
    ),
    correctionNote: input.correctionNote,
    pageTextOmitted: input.pageTextOmitted || undefined,
  };
}

function buildPageIllustrationPrompt(input: {
  project: BookProject;
  story: Story;
  profile: ChildProfile;
  characterBible: CharacterBible;
  visualReferences?: CharacterVisualReference[];
  continuityReferences?: ContinuityVisualReference[];
  spread: BookSpread;
  side: "left" | "right";
  omitPageText?: boolean;
  correctionNote?: string;
}): string {
  const {
    project,
    story,
    profile,
    characterBible,
    spread,
    side,
    omitPageText = false,
    correctionNote,
  } = input;
  const pageText = getIllustratedSpreadMomentText(spread, side);
  const pageMoment = omitPageText
    ? ""
    : sanitizePageMomentForImagePrompt(pageText);
  const latestReferenceContext = (input.visualReferences ?? [])
    .map((reference) => {
      const relationship = reference.relationship
        ? `, ${reference.relationship}`
        : "";
      const appearance = reference.appearance?.trim()
        ? ` Latest appearance: ${reference.appearance.trim()}`
        : "";
      const staleNote = reference.isStale
        ? " Reference image may be stale; use it for face identity only."
        : "";
      return `- ${reference.name} (${reference.role}${relationship}).${staleNote}${appearance}`;
    })
    .join(" ");
  const selectedReferenceNames = (input.visualReferences ?? [])
    .map((reference) => reference.name)
    .filter(Boolean)
    .join(", ");
  const continuityReferenceLabels = (input.continuityReferences ?? [])
    .map((reference) => reference.label)
    .filter(Boolean)
    .join(", ");

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
    `Illustration direction: ${spread.illustrationPrompt}.`,
    `Scene brief: ${spread.sceneBrief}.`,
    ...(pageMoment
      ? [
          `Story moment constraints, image-safe summary: ${pageMoment}. Preserve scene state exactly: which characters are present, what each character is doing, what each object or pet is doing, who is holding or not holding each object, where every important object/person/pet is located, and what has or has not happened yet. Do not move objects, pets, toys, books, gifts, food, clothing, or story props into a character's hands, onto the floor, into the background, or out of the scene unless this exact moment says so.`,
        ]
      : []),
    `Composition: ${compositionHint}.`,
    // Character consistency follows as a constraint block.
    buildIllustrationDirection(characterBible),
    selectedReferenceNames
      ? `Selected cast for this spread: ${selectedReferenceNames}. Keep to this cast unless the story moment above clearly requires another named character.`
      : "",
    continuityReferenceLabels
      ? `Approved continuity art references available: ${continuityReferenceLabels}. Use them only to preserve established likeness, outfits, recurring props, companion markings, and broad environment continuity when the same child, companion, or location reappears. Do not copy their exact composition, camera angle, pose, crop, or background layout. If these continuity images conflict with the latest selected cast references or current story moment, the latest selected cast references and current story moment win.`
      : "",
    latestReferenceContext
      ? `Latest profile/reference overrides: ${latestReferenceContext} If this conflicts with the older character bible, old generated artwork, attached reference image, or previous generated reference summary, follow these latest edited profile/reference details. Latest edited appearance is the highest priority for changeable traits: hairstyle, hair length, facial hair, glasses, outfit, body build, and apparent age. Body build is a hard override: visibly adjust silhouette, torso width, face fullness, and overall proportions to match the latest body-build cue while preserving identity. Large means moderately fuller-than-average, not very large or oversized; only draw a very large plus-size silhouette when the latest cue explicitly says Very Large. Keep skin tone and core facial identity recognisable.`
      : "",
    // Metadata.
    `Book title: ${story.title}.`,
    `Main child: ${profile.name}.`,
    `Age band: ${project.ageBand}.`,
    `Spread sequence: ${spread.sequence}, ${side} page.`,
    ...(correctionNote
      ? [
          `User correction for this redo: ${correctionNote}. Apply this correction while preserving the story moment and art style. If the correction mentions hair, hairstyle, bun, ponytail, beard, glasses, outfit, body size, build, weight, skinny, thin, large, very large, plus-size, broad, age, or proportions, it is allowed and expected to visibly change that trait instead of preserving the old generated version.`,
        ]
      : []),
    // Variation is the critical instruction - stated explicitly.
    "Illustrate this specific story moment. Scene fidelity is higher priority than a convenient character pose: the depicted object locations, who is holding what, character actions, setting detail, sequence of events, and emotional tone must match the story moment constraints, scene brief, and illustration direction above. This image must look meaningfully different from every other page in the book. Keep every selected/reference character's face shape, apparent age, hair or fur, skin tone, glasses, latest body build, and core outfit or markings consistent with the latest overrides, not stale generated artwork. No text, lettering, or page numbers inside the art.",
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

function shouldGenerateInteriorIllustration(spread: BookSpread): boolean {
  return (
    spread.layoutType === "text_art" ||
    spread.layoutType === "hero" ||
    spread.layoutType === "quiet"
  );
}

export function isBookStoryIllustrationSpread(spread: BookSpread): boolean {
  return shouldGenerateInteriorIllustration(spread);
}

// ---------------------------------------------------------------------------
// Public generation functions
// ---------------------------------------------------------------------------

export async function generateCoverIllustration(input: {
  project: BookProject;
  story: Story;
  profile: ChildProfile;
  characterBible: CharacterBible;
  visualReferences?: CharacterVisualReference[];
}): Promise<{
  coverImageUrl: string;
  coverWebImageUrl?: string;
  spreads: BookSpread[];
  provider: "openai" | "placeholder";
}> {
  const coverSpread = getCoverSpread(input.project.spreads);
  const prompt = buildCoverIllustrationPrompt({ ...input, coverSpread });

  if (isGeneratedIllustrationConfigured()) {
    try {
      let upscaled: Buffer;
      try {
        upscaled = await generateAndUpscale({
          prompt,
          visualReferences: input.visualReferences,
        });
      } catch (err) {
        if (!(err instanceof UnusableGeneratedImageError)) throw err;
        console.warn(`${err.message} - retrying cover generation once.`);
        upscaled = await generateAndUpscale({
          prompt,
          visualReferences: input.visualReferences,
        });
      }

      const [coverImageUrl, coverWebImageUrl] = await Promise.all([
        storeBookAsset({
          pathname: `books/${input.project.id}/cover.png`,
          body: upscaled,
          contentType: "image/png",
        }),
        webImageBuffer(upscaled).then((web) =>
          storeBookAsset({
            pathname: `books/${input.project.id}/cover-web.jpg`,
            body: web,
            contentType: "image/jpeg",
          })
        ),
      ]);

      return {
        coverImageUrl,
        coverWebImageUrl,
        spreads: replaceCoverSpreadImage(input.project.spreads, coverImageUrl),
        provider: "openai",
      };
    } catch (err) {
      if (
        !(err instanceof ModerationBlockedError) &&
        !(err instanceof UnusableGeneratedImageError)
      ) {
        throw err;
      }

      // Retry with a stripped prompt - the character bible or cover scene is
      // the most common moderation trigger. Same strategy as spread fallback.
      console.warn(
        "Cover generation was blocked or unusable - retrying with simplified prompt.",
        { error: getImageFailureMessage(err) }
      );
      const fallbackPrompt = buildCoverIllustrationPrompt({
        ...input,
        omitSceneDetails: true,
      });
      try {
        const retryUpscaled = await generateAndUpscale({
          prompt: fallbackPrompt,
          visualReferences: input.visualReferences,
        });
        const [coverImageUrl, coverWebImageUrl] = await Promise.all([
          storeBookAsset({
            pathname: `books/${input.project.id}/cover.png`,
            body: retryUpscaled,
            contentType: "image/png",
          }),
          webImageBuffer(retryUpscaled).then((web) =>
            storeBookAsset({
              pathname: `books/${input.project.id}/cover-web.jpg`,
              body: web,
              contentType: "image/jpeg",
            })
          ),
        ]);
        return {
          coverImageUrl,
          coverWebImageUrl,
          spreads: replaceCoverSpreadImage(
            input.project.spreads,
            coverImageUrl
          ),
          provider: "openai",
        };
      } catch (retryErr) {
        if (
          !(retryErr instanceof ModerationBlockedError) &&
          !(retryErr instanceof UnusableGeneratedImageError)
        ) {
          throw retryErr;
        }
        console.warn(
          "Cover generation blocked on retry too; using safe branded cover fallback.",
          { error: getImageFailureMessage(retryErr) }
        );
      }
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
  visualReferences?: CharacterVisualReference[];
  referenceSnapshotKey?: string;
  spread: BookSpread;
  side: "left" | "right";
  correctionNote?: string;
}): Promise<{
  url: string;
  webUrl?: string;
  provider: "openai" | "placeholder";
  qa: IllustrationGenerationMetadata;
}> {
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
    const spreadVisualReferences = selectSpreadVisualReferences(
      spread,
      input.visualReferences
    );
    const continuityReferences = selectContinuityVisualReferences({
      project,
      spread,
    });
    return {
      url: await storePlaceholderPage(),
      provider: "placeholder",
      qa: buildIllustrationQaMetadata({
        provider: "placeholder",
        characterReferences: spreadVisualReferences,
        continuityReferences,
        referenceSnapshotKey: input.referenceSnapshotKey,
        correctionNote: input.correctionNote,
      }),
    };
  }

  const storeWithWeb = async (upscaled: Buffer) => {
    const printPathname = generatedImagePathname(base, suffix);
    const webPathname = `${printPathname.replace(/\.png$/, "")}-web.jpg`;
    const [url, webUrl] = await Promise.all([
      storeBookAsset({
        pathname: printPathname,
        body: upscaled,
        contentType: "image/png",
      }),
      webImageBuffer(upscaled).then((web) =>
        storeBookAsset({
          pathname: webPathname,
          body: web,
          contentType: "image/jpeg",
        })
      ),
    ]);
    return { url, webUrl };
  };

  const spreadVisualReferences = selectSpreadVisualReferences(
    spread,
    input.visualReferences
  );
  const continuityReferences = selectContinuityVisualReferences({
    project,
    spread,
  });
  const buildQa = (options: {
    provider: "openai" | "placeholder";
    pageTextOmitted?: boolean;
  }) =>
    buildIllustrationQaMetadata({
      provider: options.provider,
      characterReferences: spreadVisualReferences,
      continuityReferences,
      referenceSnapshotKey: input.referenceSnapshotKey,
      correctionNote: input.correctionNote,
      pageTextOmitted: options.pageTextOmitted,
    });
  const prompt = buildPageIllustrationPrompt({
    ...input,
    visualReferences: spreadVisualReferences,
    continuityReferences,
  });

  try {
    let upscaled: Buffer;
    try {
      upscaled = await generateAndUpscale({
        prompt,
        visualReferences: spreadVisualReferences,
        continuityReferences,
      });
    } catch (err) {
      if (!(err instanceof UnusableGeneratedImageError)) throw err;
      console.warn(
        `${err.message} - retrying spread ${spread.sequence} ${side} page once.`
      );
      upscaled = await generateAndUpscale({
        prompt,
        visualReferences: spreadVisualReferences,
        continuityReferences,
      });
    }
    const { url, webUrl } = await storeWithWeb(upscaled);
    return { url, webUrl, provider: "openai", qa: buildQa({ provider: "openai" }) };
  } catch (err) {
    if (
      !(err instanceof ModerationBlockedError) &&
      !(err instanceof UnusableGeneratedImageError)
    ) {
      throw err;
    }
    // Retry without page text - the text is the most common moderation trigger.
    const fallbackPrompt = buildPageIllustrationPrompt({
      ...input,
      visualReferences: spreadVisualReferences,
      continuityReferences,
      omitPageText: true,
    });
    try {
      const upscaled = await generateAndUpscale({
        prompt: fallbackPrompt,
        visualReferences: spreadVisualReferences,
        continuityReferences,
      });
      const { url, webUrl } = await storeWithWeb(upscaled);
      return {
        url,
        webUrl,
        provider: "openai",
        qa: buildQa({ provider: "openai", pageTextOmitted: true }),
      };
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

function generatedImagePathname(base: string, suffix: string) {
  return `${base}${suffix}-${Date.now()}.png`;
}

export async function generateSpreadIllustration(input: {
  project: BookProject;
  story: Story;
  profile: ChildProfile;
  characterBible: CharacterBible;
  visualReferences?: CharacterVisualReference[];
  referenceSnapshotKey?: string;
  spread: BookSpread;
}): Promise<{ spread: BookSpread; provider: "openai" | "placeholder" }> {
  const { spread } = input;
  const nextSpread: BookSpread = { ...spread };

  try {
    const left = await generateSpreadPageIllustration({
      ...input,
      side: "left",
    });
    nextSpread.leftPageImageUrl = left.url;
    nextSpread.leftPageWebImageUrl = left.webUrl;
    nextSpread.rightPageImageUrl = undefined;
    nextSpread.thumbnailUrl = left.webUrl ?? left.url;
    nextSpread.leftPageImageError = undefined;
    nextSpread.rightPageImageError = undefined;
    nextSpread.leftPageQa = left.qa;
    return {
      spread: nextSpread,
      provider: left.provider,
    };
  } catch (err) {
    nextSpread.leftPageImageError = getImageFailureMessage(err);
    nextSpread.rightPageImageUrl = undefined;
    nextSpread.rightPageImageError = undefined;
    return {
      spread: nextSpread,
      provider: "placeholder",
    };
  }
}
