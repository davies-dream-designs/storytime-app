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
  LocationBible,
  LocationVisualReference,
  SceneLocation,
} from "@/types/printBook";
import { BOOK_SPEC } from "@/lib/print-books/bookConfig";
import { buildIllustrationDirection } from "@/lib/print-books/characterBible";
import {
  buildLocationDirection,
  buildSleepFurnitureDirection,
  resolveSpreadLocation,
  resolveSpreadLocationReference,
} from "@/lib/print-books/locationBible";
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

const openAIBase = () =>
  (process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1").replace(
    /\/$/,
    ""
  );

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

function getLocationReferenceImageUrl(
  location: SceneLocation
): string | undefined {
  return location.establishingImageUrl ?? location.referenceImageUrl;
}

function getPrimaryCoverLocation(input: {
  project: Pick<BookProject, "locationBible">;
  coverSpread?: BookSpread;
}): SceneLocation | undefined {
  const bible = input.project.locationBible;
  if (!bible?.locations.length) return undefined;

  const spreadLocation = input.coverSpread
    ? resolveSpreadLocation(bible, input.coverSpread)
    : undefined;
  if (spreadLocation) return spreadLocation;

  const usageCount = new Map<string, number>();
  for (const locationId of Object.values(bible.pageLocations)) {
    usageCount.set(locationId, (usageCount.get(locationId) ?? 0) + 1);
  }

  return [...bible.locations]
    .filter((location) => getLocationReferenceImageUrl(location))
    .sort(
      (a, b) => (usageCount.get(b.id) ?? 0) - (usageCount.get(a.id) ?? 0)
    )[0];
}

function buildLocationVisualReference(
  location: SceneLocation | undefined
): LocationVisualReference | undefined {
  if (!location) return undefined;
  const imageUrl = getLocationReferenceImageUrl(location);
  if (!imageUrl) return undefined;
  const sleepFurnitureDirection = buildSleepFurnitureDirection(location);
  return {
    id: `location:${location.id}`,
    label: [
      `Established view of ${location.name} — exact room layout, doors, windows, furniture, bed types, colours, and object orientation are authoritative`,
      sleepFurnitureDirection,
    ]
      .filter(Boolean)
      .join(" "),
    imageUrl,
  };
}

const OPENAI_IMAGE_PROMPT_MAX_CHARS = 32000;
const OPENAI_IMAGE_REFERENCE_PROMPT_BUDGET = 3500;
const OPENAI_IMAGE_CORE_PROMPT_BUDGET =
  OPENAI_IMAGE_PROMPT_MAX_CHARS - OPENAI_IMAGE_REFERENCE_PROMPT_BUDGET - 500;

type PromptSegment = {
  variants: string[];
};

function normalizePromptText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clampPromptText(value: string, maxChars: number): string {
  const normalized = normalizePromptText(value);
  if (normalized.length <= maxChars) return normalized;
  const trimmed = normalized.slice(0, Math.max(0, maxChars - 1));
  const boundary = Math.max(trimmed.lastIndexOf(" "), trimmed.lastIndexOf(";"));
  return `${(boundary > maxChars * 0.6 ? trimmed.slice(0, boundary) : trimmed).trim()}…`;
}

function fitPromptSegments(
  segments: PromptSegment[],
  maxChars: number
): string {
  const normalizedSegments = segments.map((segment) => ({
    variants: segment.variants.map((variant) => normalizePromptText(variant)),
  }));
  const indices = normalizedSegments.map(() => 0);

  const build = () =>
    normalizedSegments
      .map((segment, index) => segment.variants[indices[index]] ?? "")
      .filter(Boolean)
      .join(" ")
      .trim();

  while (build().length > maxChars) {
    let bestIndex = -1;
    let bestSavings = 0;

    for (let index = 0; index < normalizedSegments.length; index += 1) {
      const segment = normalizedSegments[index]!;
      const currentVariant = segment.variants[indices[index]] ?? "";
      const nextVariant = segment.variants[indices[index] + 1];
      if (nextVariant === undefined) continue;
      const savings = currentVariant.length - nextVariant.length;
      if (savings > bestSavings) {
        bestSavings = savings;
        bestIndex = index;
      }
    }

    if (bestIndex === -1) break;
    indices[bestIndex] += 1;
  }

  const fitted = build();
  return fitted.length <= maxChars ? fitted : clampPromptText(fitted, maxChars);
}

function buildLatestReferenceContext(
  references: CharacterVisualReference[] | undefined,
  compact = false
): string {
  return (references ?? [])
    .map((reference) => {
      const relationship = reference.relationship
        ? `, ${reference.relationship}`
        : "";
      const appearanceText = reference.appearance?.trim();
      const appearance = appearanceText
        ? ` Latest appearance: ${clampPromptText(appearanceText, compact ? 120 : 420)}`
        : "";
      const staleNote = reference.isStale
        ? compact
          ? " Stale image; preserve face identity only."
          : " Reference image may be stale; use it for face identity only."
        : "";
      return `- ${reference.name} (${reference.role}${relationship}).${staleNote}${appearance}`;
    })
    .join(" ");
}

export function buildCoverIllustrationPrompt(input: {
  project: BookProject;
  story: Story;
  profile: ChildProfile;
  characterBible: CharacterBible;
  coverSpread?: BookSpread;
  coverLocation?: SceneLocation;
  continuityReferences?: ContinuityVisualReference[];
  omitSceneDetails?: boolean;
}): string {
  const { story, profile, characterBible, coverSpread, coverLocation } = input;
  const coverLocationDirection = coverLocation
    ? `Cover setting source of truth: use ${coverLocation.name}. ${buildLocationDirection(coverLocation)} The attached setting reference is authoritative; do not invent extra doors, windows, bed shapes, cot/bed types, furniture, or structural details that are not in that reference.`
    : "";
  const continuityReferenceLabels = (input.continuityReferences ?? [])
    .map((reference) => reference.label)
    .filter(Boolean)
    .join(", ");

  if (input.omitSceneDetails) {
    return fitPromptSegments(
      [
        {
          variants: [
            `Book title: ${story.title}. A personalised bedtime story for ${profile.name}. Age band: ${input.project.ageBand}. Theme: ${story.theme || "gentle bedtime adventure"}.`,
          ],
        },
        {
          variants: [
            "Create a square children's picture-book front cover with a warm, gentle bedtime illustration style.",
          ],
        },
        // Keep the outfit lock even on the stripped moderation-retry prompt, so
        // the cover still matches the interior pages instead of reverting to the
        // plain top from a reference portrait.
        {
          variants: [
            "Dress each character in the specific outfit from their described appearance (for example denim overalls) if given, otherwise their usual outfit, plus their usual footwear. Any attached reference portrait defines only face, hair, glasses, skin tone, and body build - never clothing; do not copy the plain top shown in a portrait.",
            "Dress each character in their described outfit (for example overalls), not the plain top from a reference portrait.",
          ],
        },
        {
          variants: continuityReferenceLabels
            ? [
                `Attached interior page art (${continuityReferenceLabels}) is the source of truth for each character's clothing, footwear, hair, and colours - match it, but not its pose, crop, or background.`,
                `Match each character's clothing and look to the attached interior page art (${continuityReferenceLabels}).`,
              ]
            : [""],
        },
        {
          variants: coverLocationDirection
            ? [
                coverLocationDirection,
                `Use the attached setting reference for ${coverLocation?.name}: keep the exact room structure, window/door placement, bed/cot types, furniture layout, colours, and object orientation.`,
              ]
            : [""],
        },
        {
          variants: [
            "Do not render any visible publisher logo or extra text into the art itself.",
          ],
        },
      ],
      OPENAI_IMAGE_CORE_PROMPT_BUDGET
    );
  }

  const sceneDirection =
    coverSpread?.illustrationPrompt ??
    `Front cover for \"${story.title}\" starring ${profile.name}.`;

  return fitPromptSegments(
    [
      {
        variants: [
          buildIllustrationDirection(characterBible),
          buildIllustrationDirection(characterBible, { compact: true }),
        ],
      },
      {
        variants: [
          `Book title: ${story.title}. Main child: ${profile.name}. Age band: ${input.project.ageBand}. Theme: ${story.theme || "gentle bedtime adventure"}.`,
          `Book title: ${story.title}. Main child: ${profile.name}. Theme: ${story.theme || "gentle bedtime adventure"}.`,
        ],
      },
      {
        variants: [
          `Cover scene: ${clampPromptText(sceneDirection, 700)}.`,
          `Cover scene: ${clampPromptText(sceneDirection, 320)}.`,
        ],
      },
      {
        variants: [
          "Outfit source of truth, so the cover matches the interior pages: for each character, use the specific outfit named in their own described appearance or identity rules above if one is given (for example denim overalls or a striped jumper), otherwise use their locked Outfit rules; always include their locked footwear. Any attached reference portrait defines only face shape, hair, eyebrows, facial hair, glasses, skin tone, eye colour, and body build - it does NOT define clothing. Do not copy the plain top, jumper, or sweater shown in a head-and-shoulders reference portrait; draw each character's full described/locked outfit instead.",
          "Dress each character in the specific outfit from their described appearance above (for example overalls) if given, else their locked Outfit rules, plus locked footwear. Reference portraits define face, hair, glasses, skin, and build only - never clothing; do not copy the plain portrait top. This keeps the cover matching the interior pages.",
        ],
      },
      {
        variants: continuityReferenceLabels
          ? [
              `Approved interior page art is attached as a reference (${continuityReferenceLabels}). This interior page is the source of truth for each character's actual clothing and overall look on the cover: match the same outfit (for example the same overalls, dress, or jumper), footwear, hairstyle, and colours the characters wear in that interior page, so the cover clearly belongs to the same book. Do not copy that page's exact pose, camera angle, crop, or background - only its established character look and clothing.`,
              `Attached interior page art (${continuityReferenceLabels}) is the source of truth for each character's clothing and look on the cover: match the same outfit, footwear, hair, and colours from that page, but not its pose, crop, or background.`,
            ]
          : [""],
      },
      {
        variants: coverLocationDirection
          ? [
              coverLocationDirection,
              `Use the attached setting reference for ${coverLocation?.name}: keep exact doors, windows, bed/cot types, furniture positions, colours, and object orientation; do not add a door, window, cot, or bed that is not present in the reference.`,
            ]
          : [""],
      },
      {
        variants: [
          "Create a square children's picture-book front cover with space for title treatment and a warm bedtime-book feeling.",
          "Create a square bedtime picture-book front cover with a warm storybook feeling.",
        ],
      },
      {
        variants: [
          "Do not render any visible publisher logo or extra text into the art itself.",
          "No visible publisher logo or extra text inside the art.",
        ],
      },
    ],
    OPENAI_IMAGE_CORE_PROMPT_BUDGET
  );
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
const MAX_LOCATION_REFERENCES_PER_IMAGE = 1;
// Each reference is drawn into a square cell on the conditioning sheet. 768px
// (vs the old 384px) preserves enough facial detail for the image model to hold
// a likeness across pages; the sheet PNG only feeds /v1/images/edits and is
// independent of the 1024x1024 output size.
const REFERENCE_CELL_SIZE = 768;
const REFERENCE_SHEET_BACKGROUND = "#fff8ea";
// Keyword-match thresholds for including a supporting character's reference on
// a given spread. A strong match (name/relationship in the page text) always
// qualifies; a weak match is only used as a last-resort single fallback so a
// character who isn't in the scene is not forced into it.
const SUPPORTING_CAST_STRONG_MATCH_SCORE = 20;
const SUPPORTING_CAST_WEAK_MATCH_SCORE = 12;

type ImageConditionReference =
  | ({ kind: "character" } & CharacterVisualReference)
  | ({ kind: "continuity" } & ContinuityVisualReference)
  | ({ kind: "location" } & LocationVisualReference);

async function loadReferenceImageBuffer(input: {
  id: string;
  imageUrl: string;
  kind: "character" | "continuity" | "location";
}): Promise<Buffer | null> {
  try {
    const response = await fetch(input.imageUrl);
    if (!response.ok) return null;
    const source = Buffer.from(await response.arrayBuffer());
    // "contain" (not "cover") so faces are never cropped out of the reference,
    // and a larger cell so fine facial detail survives to the image model.
    return sharp(source)
      .rotate()
      .resize(REFERENCE_CELL_SIZE, REFERENCE_CELL_SIZE, {
        fit: "contain",
        background: REFERENCE_SHEET_BACKGROUND,
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
  locationReferences?: LocationVisualReference[];
}): Promise<{
  image: Buffer;
  visualReferences: CharacterVisualReference[];
  continuityReferences: ContinuityVisualReference[];
  locationReferences: LocationVisualReference[];
} | null> {
  const selectedCharacters = (input.visualReferences ?? [])
    .filter((reference) => reference.imageUrl)
    .slice(0, MAX_VISUAL_REFERENCES_PER_IMAGE);
  const selectedContinuity = (input.continuityReferences ?? [])
    .filter((reference) => reference.imageUrl)
    .slice(0, MAX_CONTINUITY_REFERENCES_PER_IMAGE);
  const selectedLocations = (input.locationReferences ?? [])
    .filter((reference) => reference.imageUrl)
    .slice(0, MAX_LOCATION_REFERENCES_PER_IMAGE);
  const selected: ImageConditionReference[] = [
    ...selectedCharacters.map((reference) => ({
      ...reference,
      kind: "character" as const,
    })),
    ...selectedLocations.map((reference) => ({
      ...reference,
      kind: "location" as const,
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
    (item): item is { reference: ImageConditionReference; image: Buffer } =>
      Boolean(item.image)
  );
  if (usable.length === 0) return null;

  const cellSize = REFERENCE_CELL_SIZE;
  const columns = Math.min(3, usable.length);
  const rows = Math.ceil(usable.length / columns);
  const image = await sharp({
    create: {
      width: columns * cellSize,
      height: rows * cellSize,
      channels: 3,
      background: REFERENCE_SHEET_BACKGROUND,
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
      .map((item) => ({
        id: item.reference.id,
        name: item.reference.name,
        role: item.reference.role,
        relationship: item.reference.relationship,
        imageUrl: item.reference.imageUrl,
        appearance: item.reference.appearance,
        isStale: item.reference.isStale,
      })),
    continuityReferences: usable
      .filter(
        (
          item
        ): item is {
          reference: ContinuityVisualReference & { kind: "continuity" };
          image: Buffer;
        } => item.reference.kind === "continuity"
      )
      .map((item) => ({
        id: item.reference.id,
        label: item.reference.label,
        imageUrl: item.reference.imageUrl,
        source: item.reference.source,
        sequence: item.reference.sequence,
      })),
    locationReferences: usable
      .filter(
        (
          item
        ): item is {
          reference: LocationVisualReference & { kind: "location" };
          image: Buffer;
        } => item.reference.kind === "location"
      )
      .map((item) => ({
        id: item.reference.id,
        label: item.reference.label,
        imageUrl: item.reference.imageUrl,
      })),
  };
}

function buildVisualReferencePrompt(input: {
  visualReferences?: CharacterVisualReference[];
  continuityReferences?: ContinuityVisualReference[];
  locationReferences?: LocationVisualReference[];
}): string {
  const referenceList = (input.visualReferences ?? [])
    .map((reference, index) => {
      const relationship = reference.relationship
        ? `, ${reference.relationship}`
        : "";
      const appearance = reference.appearance?.trim()
        ? `: ${clampPromptText(reference.appearance.trim(), 420)}`
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
  const locationList = (input.locationReferences ?? [])
    .map((reference) => reference.label)
    .join(" ");

  return fitPromptSegments(
    [
      {
        variants: [
          referenceList
            ? `Attached character reference sheet order: ${referenceList}`
            : "",
          referenceList
            ? `Attached character reference sheet order: ${clampPromptText(referenceList, 900)}`
            : "",
        ],
      },
      {
        variants: [
          locationList
            ? `Attached setting reference image (${locationList}) is the authoritative setting blueprint. Match its exact room layout, doors, windows, bed types, furniture positions, colours, and object orientation for the background; do not invent, remove, or move doors/windows/beds. Draw characters from their own references, not from this setting image.`
            : "",
          locationList
            ? `Attached setting reference image (${locationList}) is authoritative: keep the same doors, windows, bed types, furniture positions, colours, and object orientation.`
            : "",
        ],
      },
      {
        variants: [
          continuityList
            ? `Attached approved continuity art sheet order: ${continuityList}`
            : "",
          continuityList
            ? `Attached approved continuity art sheet order: ${clampPromptText(continuityList, 180)}`
            : "",
        ],
      },
      {
        variants: [
          referenceList || continuityList
            ? "The attached reference sheet is the authoritative source for each character's face and identity: reproduce the same facial structure, proportions, and features so they are unmistakably the same person on every page. Reuse it only for likeness and continuity, not for its crop, plain background, portrait pose, or sheet layout."
            : "",
          referenceList || continuityList
            ? "Reference sheet is authoritative for each character's face and identity; keep them unmistakably the same person on every page. Do not copy its crop, pose, or layout."
            : "",
        ],
      },
      {
        variants: [
          referenceList
            ? "When a selected child, family member, friend, or pet appears, they must clearly match their reference: the same recognisable face and facial features, skin tone, hair, and familiar markings, only re-posed and re-lit for the scene."
            : "",
          referenceList
            ? "When a selected child, family member, friend, or pet appears, keep their reference face, skin tone, hair, and markings clearly recognisable."
            : "",
        ],
      },
      {
        variants: [
          referenceList
            ? "Identity colour lock: match each character's real hair colour, eyebrow colour, facial-hair colour, skin tone, and eye colour to the reference image. Never warm-tint, redden, or lighten hair, skin, or eyes to fit the bedtime palette; apply the warm palette only to background, clothing, and lighting. Keep any eyeglasses shown on a character in every spread they appear in."
            : "",
          referenceList
            ? "Identity colour lock: keep each character's hair, skin, and eye colour and any eyeglasses as in the reference; apply the warm palette only to background, clothing, and lighting, never to hair, skin, or eyes."
            : "",
        ],
      },
      {
        variants: [
          referenceList
            ? "If a reference is marked stale, do not preserve body size, hairstyle, outfit, apparent age, pose, or clothing from that image; preserve only core facial identity and follow the latest text."
            : "",
          referenceList
            ? "If a reference is marked stale, preserve only core facial identity and follow the latest text."
            : "",
        ],
      },
      {
        variants: [
          referenceList
            ? "Latest edited profile/reference text controls changeable visual traits including hair length, hairstyle, facial hair, glasses, outfit, body build, and apparent age. If latest text conflicts with the attached image or older generated image, change the artwork to match the latest text while keeping the person recognisable."
            : "",
          referenceList
            ? "Latest edited profile/reference text controls hair, facial hair, glasses, outfit, body build, and apparent age; if it conflicts with the image, follow the latest text."
            : "",
        ],
      },
      {
        variants: [
          referenceList
            ? "Body build is controlled by the latest profile/reference text. If that latest body-build text conflicts with the attached image or an older generated image, change the figure silhouette and proportions to match the latest body-build text while keeping the face recognisable."
            : "",
          referenceList
            ? "Body build is controlled by the latest profile/reference text; if it conflicts with the image, change the silhouette to match the latest text while keeping the face recognisable."
            : "",
        ],
      },
      {
        variants: [
          referenceList
            ? "If latest body build is Large, draw a moderately fuller-than-average person, not a very large or oversized person. If an attached reference image shows a much larger body than the latest Large cue, reduce the body size in the new artwork and preserve identity through face, hair, glasses, skin tone, and expression."
            : "",
          referenceList
            ? "Large means moderately fuller-than-average, not oversized; if the image conflicts, preserve identity while matching the latest body-build text."
            : "",
        ],
      },
      {
        variants: [
          referenceList
            ? "Only use a very large plus-size silhouette when the latest profile/reference text explicitly says Very Large."
            : "",
        ],
      },
      {
        variants: [
          referenceList
            ? "Do not make grandparents generically older, thinner, heavier, or frailer than their latest profile/reference details."
            : "",
          referenceList ? "Do not make grandparents generic stereotypes." : "",
        ],
      },
      {
        variants: [
          continuityList
            ? "Use approved continuity art only to preserve recurring outfit colours, key props, companion markings, and broad location continuity across spreads. Do not repeat the exact composition, angle, pose, or page layout from continuity art."
            : "",
          continuityList
            ? "Use approved continuity art only to preserve recurring outfits, props, companion markings, and broad location continuity."
            : "",
        ],
      },
      {
        variants: [
          "Do not add written labels, captions, names, numbers, watermarks, or relationship words to the artwork.",
          "No labels, captions, names, numbers, watermarks, or relationship words in the art.",
        ],
      },
    ],
    OPENAI_IMAGE_REFERENCE_PROMPT_BUDGET
  );
}

async function buildOpenAIImageEditBody(input: {
  model: string;
  prompt: string;
  size: "1024x1024";
  visualReferences?: CharacterVisualReference[];
  continuityReferences?: ContinuityVisualReference[];
  locationReferences?: LocationVisualReference[];
}): Promise<FormData> {
  const sheet = await buildIllustrationConditioningSheet({
    visualReferences: input.visualReferences,
    continuityReferences: input.continuityReferences,
    locationReferences: input.locationReferences,
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
  const finalPrompt = clampPromptText(
    [
      buildVisualReferencePrompt({
        visualReferences: sheet.visualReferences,
        continuityReferences: sheet.continuityReferences,
        locationReferences: sheet.locationReferences,
      }),
      input.prompt,
    ]
      .filter(Boolean)
      .join(" "),
    OPENAI_IMAGE_PROMPT_MAX_CHARS
  );
  formData.append("prompt", finalPrompt);
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
  locationReferences?: LocationVisualReference[];
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
        input.visualReferences?.length ||
        input.continuityReferences?.length ||
        input.locationReferences?.length
      );
      const body = useConditioningReferences
        ? await buildOpenAIImageEditBody({
            model,
            prompt: input.prompt,
            size: input.size,
            visualReferences: input.visualReferences,
            continuityReferences: input.continuityReferences,
            locationReferences: input.locationReferences,
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
          ? `${openAIBase()}/images/edits`
          : `${openAIBase()}/images/generations`,
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
  locationReferences?: LocationVisualReference[];
}): Promise<Buffer> {
  if (
    input.visualReferences?.length ||
    input.continuityReferences?.length ||
    input.locationReferences?.length
  ) {
    try {
      return await generateOpenAIImage({
        prompt: input.prompt,
        size: BOOK_SPEC.coverIllustrationOpenAISize,
        visualReferences: input.visualReferences,
        continuityReferences: input.continuityReferences,
        locationReferences: input.locationReferences,
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
  locationReferences?: LocationVisualReference[];
}): Promise<Buffer> {
  const png = await generateBaseImage(input);
  await assertUsableGeneratedImage(png);
  return upscaleImageBuffer(png);
}

function buildEstablishingImagePrompt(location: SceneLocation): string {
  return [
    `A children's picture-book illustration establishing shot of "${location.name}" — an empty scene with no people or characters.`,
    "Show the whole space clearly in a neutral, eye-level, straight-on view so it can be used as the canonical reference for this location.",
    buildLocationDirection(location),
    "Soft, warm, storybook style. No text, no watermark, no characters.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Generate a canonical "establishing" image once per location that has no
 * reference image yet, so every spread set there can anchor to the same room
 * layout and object orientation. Returns an updated LocationBible; failures for
 * any single location are non-fatal and leave that location unchanged.
 */
export async function generateLocationEstablishingImages(input: {
  project: Pick<BookProject, "id" | "userId">;
  locationBible: LocationBible | undefined;
}): Promise<LocationBible | undefined> {
  const { locationBible, project } = input;
  if (!locationBible?.locations.length) return locationBible;
  if (!isBookAssetStorageConfigured() || !isOpenAIConfigured()) {
    return locationBible;
  }

  const locations = await Promise.all(
    locationBible.locations.map(async (location) => {
      if (location.referenceImageUrl || location.establishingImageUrl) {
        return location;
      }
      try {
        const png = await generateAndUpscale({
          prompt: buildEstablishingImagePrompt(location),
        });
        const establishingImageUrl = await storeBookAsset({
          pathname: `book-locations/${project.userId}/${project.id}/${location.id}-establishing-${Date.now()}.png`,
          body: png,
          contentType: "image/png",
        });
        return { ...location, establishingImageUrl };
      } catch (err) {
        console.warn(
          `Establishing image for location "${location.name}" failed (${
            err instanceof Error ? err.message : "unknown error"
          }) - continuing without it.`
        );
        return location;
      }
    })
  );

  return { ...locationBible, locations };
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function sanitizePageMomentForImagePrompt(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(
      /\b(bare\s+(?:little\s+)?toes?|bare\s+feet|feet|toes?)\b/gi,
      "shoes"
    )
    .replace(
      /\b(warm\s+mud|muddy\s+skin|mud\s+on\s+(?:their|his|her)\s+body)\b/gi,
      "soft ground"
    )
    .replace(
      /\b(naked|nude|undressed|underwear|nappy|diaper)\b/gi,
      "fully clothed"
    )
    .replace(/\b(bath|bathing|toilet|potty)\b/gi, "bedtime room")
    .replace(
      /\b(injured|injury|blood|weapon|knife|gun|drowning|restraint|restrained)\b/gi,
      "safe"
    )
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

const IMPLIED_COMPANION_HINTS = [
  "together",
  "they",
  "them",
  "their",
  "with",
  "beside",
  "alongside",
  "joined",
  "both",
  "shared",
  "walked",
  "watched",
];

const CONTINUITY_KEYWORD_STOPWORDS = new Set([
  "the",
  "and",
  "with",
  "into",
  "from",
  "over",
  "under",
  "through",
  "while",
  "where",
  "that",
  "this",
  "little",
  "looked",
  "look",
  "walked",
  "watched",
  "story",
  "scene",
  "moment",
  "page",
  "spread",
  "mila",
]);

function normalizeReferenceSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSpreadReferenceHaystack(spread: BookSpread): string {
  return normalizeReferenceSearchText(
    [
      spread.title,
      spread.leftPageText,
      spread.rightPageText,
      spread.sceneBrief,
      spread.illustrationPrompt,
    ].join(" ")
  );
}

function tokenizeNormalizedText(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(" ")
        .map((part) => part.trim())
        .filter((part) => part.length >= 3)
    )
  );
}

function getReferenceSearchTerms(
  reference: CharacterVisualReference
): string[] {
  const terms = [normalizeReferenceSearchText(reference.name)];
  const relationship = normalizeReferenceSearchText(
    reference.relationship ?? ""
  );
  if (relationship) {
    terms.push(relationship);
    terms.push(
      ...(RELATIONSHIP_REFERENCE_HINTS[relationship.replace(/\s+/g, "_")] ?? [])
    );
  }
  return Array.from(new Set(terms.filter(Boolean)));
}

function getRecentSpreadCharacterReferenceIds(
  project: BookProject,
  spread: BookSpread
): Set<string> {
  return new Set(
    project.spreads
      .filter((candidate) => candidate.sequence < spread.sequence)
      .sort((a, b) => b.sequence - a.sequence)
      .slice(0, 2)
      .flatMap((candidate) => [
        ...(candidate.leftPageQa?.characterReferenceIds ?? []),
        ...(candidate.rightPageQa?.characterReferenceIds ?? []),
      ])
  );
}

function scoreReferenceForSpread(input: {
  reference: CharacterVisualReference;
  haystack: string;
  recentCharacterIds: Set<string>;
  companionHintPresent: boolean;
  nonMainReferenceCount: number;
}): number {
  const { reference, haystack, recentCharacterIds, companionHintPresent } =
    input;
  let score = 0;
  for (const term of getReferenceSearchTerms(reference)) {
    if (!term) continue;
    if (haystack.includes(term)) {
      score += term === normalizeReferenceSearchText(reference.name) ? 40 : 24;
    }
  }
  if (recentCharacterIds.has(reference.id) && companionHintPresent) score += 18;
  if (
    input.nonMainReferenceCount === 1 &&
    recentCharacterIds.has(reference.id) &&
    !score
  ) {
    score += 8;
  }
  return score;
}

export function selectSpreadVisualReferences(input: {
  project: BookProject;
  spread: BookSpread;
  references?: CharacterVisualReference[];
}): CharacterVisualReference[] {
  const references = input.references ?? [];
  if (references.length === 0) return [];

  const haystack = buildSpreadReferenceHaystack(input.spread);
  const recentCharacterIds = getRecentSpreadCharacterReferenceIds(
    input.project,
    input.spread
  );
  const companionHintPresent = IMPLIED_COMPANION_HINTS.some((hint) =>
    haystack.includes(hint)
  );
  const mainChildReferences = references.filter(
    (reference) => reference.role === "main_child"
  );
  const nonMainReferences = references.filter(
    (reference) => reference.role !== "main_child"
  );
  const scoredNonMain = nonMainReferences
    .map((reference) => ({
      reference,
      score: scoreReferenceForSpread({
        reference,
        haystack,
        recentCharacterIds,
        companionHintPresent,
        nonMainReferenceCount: nonMainReferences.length,
      }),
    }))
    .sort((a, b) => b.score - a.score);

  const selected = scoredNonMain
    .filter((entry) => entry.score >= SUPPORTING_CAST_STRONG_MATCH_SCORE)
    .map((entry) => entry.reference);

  if (
    selected.length === 0 &&
    scoredNonMain[0]?.score >= SUPPORTING_CAST_WEAK_MATCH_SCORE
  ) {
    selected.push(scoredNonMain[0].reference);
  }

  const fallback = [...mainChildReferences, ...selected];
  return fallback.slice(0, MAX_VISUAL_REFERENCES_PER_IMAGE);
}

function isPlaceholderReferenceImageUrl(url?: string): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return lower.startsWith("data:image/svg") || lower.endsWith(".svg");
}

function getContinuityKeywordScore(
  current: BookSpread,
  candidate: BookSpread
): number {
  const currentKeywords = tokenizeNormalizedText(
    buildSpreadReferenceHaystack(current)
  ).filter((keyword) => !CONTINUITY_KEYWORD_STOPWORDS.has(keyword));
  if (currentKeywords.length === 0) return 0;
  const candidateKeywords = new Set(
    tokenizeNormalizedText(buildSpreadReferenceHaystack(candidate)).filter(
      (keyword) => !CONTINUITY_KEYWORD_STOPWORDS.has(keyword)
    )
  );
  return currentKeywords.reduce(
    (total, keyword) => total + (candidateKeywords.has(keyword) ? 1 : 0),
    0
  );
}

export function scoreContinuitySpread(input: {
  spread: BookSpread;
  candidate: BookSpread;
  selectedCharacterIds: Set<string>;
}): number {
  const candidateCharacterIds = new Set([
    ...(input.candidate.leftPageQa?.characterReferenceIds ?? []),
    ...(input.candidate.rightPageQa?.characterReferenceIds ?? []),
  ]);
  let sharedCharacterScore = 0;
  for (const id of input.selectedCharacterIds) {
    if (candidateCharacterIds.has(id)) sharedCharacterScore += 40;
  }
  // Prior spreads set in the SAME location are strong anchors for object/scene
  // continuity (e.g. keeping a cot's placement and orientation stable), even
  // when they share no characters with the current spread.
  const sharedLocationScore =
    input.spread.locationId &&
    input.candidate.locationId === input.spread.locationId
      ? 30
      : 0;
  const keywordScore =
    getContinuityKeywordScore(input.spread, input.candidate) * 6;
  if (
    sharedCharacterScore === 0 &&
    sharedLocationScore === 0 &&
    keywordScore === 0
  ) {
    return 0;
  }
  const recencyScore = Math.max(
    0,
    12 - (input.spread.sequence - input.candidate.sequence)
  );
  // The first interior spread is drawn first and is the most canonical, least
  // drifted page in the book. Bias toward it as a stable anchor so early
  // likeness doesn't get out-voted by the most-recent (already drifting) pages.
  const anchorScore = input.candidate.sequence === 2 ? 10 : 0;
  const qaScore = candidateCharacterIds.size > 0 ? 4 : 0;
  return (
    sharedCharacterScore +
    sharedLocationScore +
    keywordScore +
    recencyScore +
    anchorScore +
    qaScore
  );
}

function selectContinuityVisualReferences(input: {
  project: BookProject;
  spread: BookSpread;
  selectedCharacterReferences: CharacterVisualReference[];
}): ContinuityVisualReference[] {
  const selectedCharacterIds = new Set(
    input.selectedCharacterReferences.map((reference) => reference.id)
  );
  const continuityCandidates: Array<
    ContinuityVisualReference & { score: number }
  > = [];
  const { project, spread } = input;

  if (!isPlaceholderReferenceImageUrl(project.assets.coverImageUrl)) {
    continuityCandidates.push({
      id: `cover:${project.id}`,
      label: "Approved cover art",
      imageUrl: project.assets.coverImageUrl!,
      source: "cover",
      sequence: 1,
      score: selectedCharacterIds.size > 0 ? 16 : 8,
    });
  }

  const priorSpreads = project.spreads.filter(
    (candidate) =>
      candidate.sequence < spread.sequence &&
      candidate.sequence > 1 &&
      candidate.title !== "Cover" &&
      !isPlaceholderReferenceImageUrl(
        candidate.leftPageImageUrl ??
          candidate.imageUrl ??
          candidate.thumbnailUrl
      )
  );

  continuityCandidates.push(
    ...priorSpreads.map((candidate) => {
      const sameLocation = Boolean(
        spread.locationId && candidate.locationId === spread.locationId
      );
      return {
        id: `spread:${candidate.id}`,
        label: sameLocation
          ? `Approved spread ${candidate.sequence} — same location (match the room layout, furniture placement, and object orientation)`
          : `Approved spread ${candidate.sequence}`,
        imageUrl:
          candidate.leftPageImageUrl ??
          candidate.imageUrl ??
          candidate.thumbnailUrl!,
        source: "spread" as const,
        sequence: candidate.sequence,
        score: scoreContinuitySpread({
          spread,
          candidate,
          selectedCharacterIds,
        }),
      };
    })
  );

  return continuityCandidates
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      imageUrl: candidate.imageUrl,
      source: candidate.source,
      sequence: candidate.sequence,
    }));
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
    characterReferenceIds: input.characterReferences.map(
      (reference) => reference.id
    ),
    characterReferenceNames: input.characterReferences.map(
      (reference) => reference.name
    ),
    continuityReferenceIds: input.continuityReferences.map(
      (reference) => reference.id
    ),
    continuityReferenceLabels: input.continuityReferences.map(
      (reference) => reference.label
    ),
    staleCharacterReferenceNames: input.characterReferences
      .filter((reference) => reference.isStale)
      .map((reference) => reference.name),
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
  // This spread's own narrative/scene text. It already reflects the cumulative
  // per-spread gating applied at compose time (companions/props not yet
  // introduced were stripped from the spread's illustrationPrompt), so gating
  // the render-time direction by it stays aligned with the story's progress and
  // keeps a companion drawn only once the story has introduced it.
  const cumulativeSceneText = buildSpreadReferenceHaystack(spread);
  const spreadLocation = resolveSpreadLocation(project.locationBible, spread);
  const latestReferenceContext = buildLatestReferenceContext(
    input.visualReferences
  );
  const compactLatestReferenceContext = buildLatestReferenceContext(
    input.visualReferences,
    true
  );
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

  return fitPromptSegments(
    [
      {
        variants: [
          `Illustration direction: ${clampPromptText(spread.illustrationPrompt, 900)}.`,
          `Illustration direction: ${clampPromptText(spread.illustrationPrompt, 420)}.`,
        ],
      },
      {
        variants: [
          `Scene brief: ${clampPromptText(spread.sceneBrief, 700)}.`,
          `Scene brief: ${clampPromptText(spread.sceneBrief, 320)}.`,
          "",
        ],
      },
      {
        variants: spreadLocation
          ? [
              buildLocationDirection(spreadLocation),
              buildLocationDirection(spreadLocation, { compact: true }),
              "",
            ]
          : [""],
      },
      {
        variants: pageMoment
          ? [
              `Story moment constraints, image-safe summary: ${pageMoment}. Preserve scene state exactly: which characters are present, what each character is doing, what each object or pet is doing, who is holding or not holding each object, where every important object/person/pet is located, and what has or has not happened yet. Do not move objects, pets, toys, books, gifts, food, clothing, or story props into a character's hands, onto the floor, into the background, or out of the scene unless this exact moment says so.`,
              `Story moment constraints: ${pageMoment}. Keep character actions, props, locations, and event order exactly as described.`,
              `Story moment: ${pageMoment}.`,
            ]
          : [""],
      },
      {
        variants: [`Composition: ${compositionHint}.`, ""],
      },
      {
        variants: [
          buildIllustrationDirection(characterBible, {
            activeSceneText: cumulativeSceneText,
          }),
          buildIllustrationDirection(characterBible, {
            compact: true,
            activeSceneText: cumulativeSceneText,
          }),
        ],
      },
      {
        variants: selectedReferenceNames
          ? [
              `Selected cast for this spread: ${selectedReferenceNames}. Keep to this cast unless the story moment above clearly requires another named character.`,
              `Selected cast for this spread: ${selectedReferenceNames}. Keep to this cast unless the story moment clearly requires another named character.`,
            ]
          : [""],
      },
      {
        variants: continuityReferenceLabels
          ? spreadLocation
            ? [
                `Approved continuity art references available: ${continuityReferenceLabels}. Use them to preserve established likeness, outfits, recurring props, companion markings, and — when the reference is set in this same location — the room, furniture, props, their positions, and the light source. You may vary the camera angle, pose, and crop, but keep the setting consistent with references from this location. If these continuity images conflict with the latest selected cast references or current story moment, the latest selected cast references and current story moment win.`,
                `Approved continuity art references available: ${continuityReferenceLabels}. Preserve likeness, outfits, props, and — for the same location — the room, furniture, positions, and lighting; vary only the camera angle and pose. If they conflict with the latest selected cast references or current story moment, the latest wins.`,
                `Approved continuity art references available: ${continuityReferenceLabels}.`,
              ]
            : [
                `Approved continuity art references available: ${continuityReferenceLabels}. Use them only to preserve established likeness, outfits, recurring props, companion markings, and broad environment continuity when the same child, companion, or location reappears. Do not copy their exact composition, camera angle, pose, crop, or background layout. If these continuity images conflict with the latest selected cast references or current story moment, the latest selected cast references and current story moment win.`,
                `Approved continuity art references available: ${continuityReferenceLabels}. Use them only to preserve established likeness, outfits, props, companion markings, and broad environment continuity. If they conflict with the latest selected cast references or current story moment, the latest selected cast references and current story moment win.`,
                `Approved continuity art references available: ${continuityReferenceLabels}.`,
              ]
          : [""],
      },
      {
        variants: latestReferenceContext
          ? [
              `Latest profile/reference overrides: ${latestReferenceContext} If this conflicts with the older character bible, old generated artwork, attached reference image, or previous generated reference summary, follow these latest edited profile/reference details. Latest edited appearance is the highest priority for changeable traits: hairstyle, hair length, facial hair, glasses, outfit, body build, and apparent age. Body build is a hard override: visibly adjust silhouette, torso width, face fullness, and overall proportions to match the latest body-build cue while preserving identity. Large means moderately fuller-than-average, not very large or oversized; only draw a very large plus-size silhouette when the latest cue explicitly says Very Large. Keep skin tone and core facial identity recognisable.`,
              `Latest profile/reference overrides: ${compactLatestReferenceContext} If this conflicts with older artwork or the attached image, follow these latest edited profile/reference details. Latest edited appearance controls hairstyle, hair length, facial hair, glasses, outfit, body build, and apparent age. Large means moderately fuller-than-average, not oversized; only use a very large plus-size silhouette when the latest cue explicitly says Very Large.`,
              `Latest profile/reference overrides: ${compactLatestReferenceContext}`,
            ]
          : [""],
      },
      {
        variants: [
          `Book title: ${story.title}. Main child: ${profile.name}. Age band: ${project.ageBand}. Spread sequence: ${spread.sequence}, ${side} page.`,
          `Book title: ${story.title}. Main child: ${profile.name}. Spread sequence: ${spread.sequence}, ${side} page.`,
          "",
        ],
      },
      {
        variants: correctionNote
          ? [
              `User correction for this redo: ${clampPromptText(correctionNote, 500)}. Apply this correction while preserving the story moment and art style. If the correction mentions hair, hairstyle, bun, ponytail, beard, glasses, outfit, body size, build, weight, skinny, thin, large, very large, plus-size, broad, age, or proportions, it is allowed and expected to visibly change that trait instead of preserving the old generated version.`,
              `User correction for this redo: ${clampPromptText(correctionNote, 220)}. Apply it while preserving the story moment and art style; visible trait changes are allowed when explicitly requested.`,
              `User correction for this redo: ${clampPromptText(correctionNote, 140)}.`,
            ]
          : [""],
      },
      {
        variants: spreadLocation
          ? [
              "Illustrate this specific story moment. Scene fidelity is higher priority than a convenient character pose: the depicted object locations, who is holding what, character actions, setting detail, sequence of events, and emotional tone must match the story moment constraints, scene brief, illustration direction, and setting above. Vary the camera angle and composition from other pages for visual interest, but keep the room, furniture, props, their positions, and the light source consistent with other pages set in this same location. Keep every selected/reference character's face shape, apparent age, hair or fur, skin tone, glasses, latest body build, and core outfit or markings consistent with the latest overrides, not stale generated artwork. No text, lettering, or page numbers inside the art.",
              "Illustrate this exact story moment. Match the described actions, props, locations, sequence, and emotional tone, and keep the setting consistent with other pages in this location while varying the camera angle. Keep selected/reference characters visually consistent with the latest overrides, not stale artwork. No text, lettering, or page numbers inside the art.",
            ]
          : [
              "Illustrate this specific story moment. Scene fidelity is higher priority than a convenient character pose: the depicted object locations, who is holding what, character actions, setting detail, sequence of events, and emotional tone must match the story moment constraints, scene brief, and illustration direction above. This image must look meaningfully different from every other page in the book. Keep every selected/reference character's face shape, apparent age, hair or fur, skin tone, glasses, latest body build, and core outfit or markings consistent with the latest overrides, not stale generated artwork. No text, lettering, or page numbers inside the art.",
              "Illustrate this exact story moment. Match the described actions, props, locations, sequence, and emotional tone. Keep selected/reference characters visually consistent with the latest overrides, not stale artwork. No text, lettering, or page numbers inside the art.",
            ],
      },
    ],
    OPENAI_IMAGE_CORE_PROMPT_BUDGET
  );
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
  continuityReferences?: ContinuityVisualReference[];
}): Promise<{
  coverImageUrl: string;
  coverWebImageUrl?: string;
  spreads: BookSpread[];
  provider: "openai" | "placeholder";
}> {
  const coverSpread = getCoverSpread(input.project.spreads);
  const coverLocation = getPrimaryCoverLocation({
    project: input.project,
    coverSpread,
  });
  const locationReference = buildLocationVisualReference(coverLocation);
  const locationReferences = locationReference
    ? [locationReference]
    : undefined;
  const prompt = buildCoverIllustrationPrompt({
    ...input,
    coverSpread,
    coverLocation,
  });

  if (isGeneratedIllustrationConfigured()) {
    try {
      let upscaled: Buffer;
      try {
        upscaled = await generateAndUpscale({
          prompt,
          visualReferences: input.visualReferences,
          continuityReferences: input.continuityReferences,
          locationReferences,
        });
      } catch (err) {
        if (!(err instanceof UnusableGeneratedImageError)) throw err;
        console.warn(`${err.message} - retrying cover generation once.`);
        upscaled = await generateAndUpscale({
          prompt,
          visualReferences: input.visualReferences,
          continuityReferences: input.continuityReferences,
          locationReferences,
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
        coverLocation,
        omitSceneDetails: true,
      });
      try {
        const retryUpscaled = await generateAndUpscale({
          prompt: fallbackPrompt,
          visualReferences: input.visualReferences,
          continuityReferences: input.continuityReferences,
          locationReferences,
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
    const spreadVisualReferences = selectSpreadVisualReferences({
      project,
      spread,
      references: input.visualReferences,
    });
    const continuityReferences = selectContinuityVisualReferences({
      project,
      spread,
      selectedCharacterReferences: spreadVisualReferences,
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

  const spreadVisualReferences = selectSpreadVisualReferences({
    project,
    spread,
    references: input.visualReferences,
  });
  const continuityReferences = selectContinuityVisualReferences({
    project,
    spread,
    selectedCharacterReferences: spreadVisualReferences,
  });
  const locationReference = resolveSpreadLocationReference(
    project.locationBible,
    spread
  );
  const locationReferences = locationReference
    ? [locationReference]
    : undefined;
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
        locationReferences,
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
        locationReferences,
      });
    }
    const { url, webUrl } = await storeWithWeb(upscaled);
    return {
      url,
      webUrl,
      provider: "openai",
      qa: buildQa({ provider: "openai" }),
    };
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
        locationReferences,
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
