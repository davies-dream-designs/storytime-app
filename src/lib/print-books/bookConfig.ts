// Single source of truth for all Storycot book dimensions, illustration targets, and print constraints.
// Every other print-books module derives its values from here — nothing hardcoded elsewhere.

export const BOOK_SPEC = {
  // Physical trim (21cm × 21cm square)
  trimKey: "storycot-dynamic-square",
  trimLabel: "Storycot 21x21cm square illustrated book",
  trimWidthIn: 8.3,
  trimHeightIn: 8.3,

  // Print setup
  bleedIn: 0.125,
  safetyMarginIn: 0.5,
  fullBleedTextSafeMarginIn: 0.625,

  // Spine
  spineMinWidthIn: 0.18,
  spineWidthPerPage: 0.0032,
  spineTextMinPageCount: 40,

  // Page count constraints
  minPageCount: 20,
  maxPageCount: 122,

  // Illustration request sizes — both cover and interior are square to match the square trim.
  // Portrait generation would waste resolution on a square panel and result in cropping.
  coverIllustrationOpenAISize: "1024x1024" as const,
  interiorIllustrationOpenAISize: "1024x1024" as const,
  illustrationWidthPx: 1024,
  illustrationHeightPx: 1024,

  // Upscale target: 300 PPI at 8.3" trim = 2490 × 2490 px.
  // OpenAI tops out at 1024×1024 for square images so we upscale with sharp post-generation.
  upscalePpi: 300,
  upscaleWidthPx: 2490,
  upscaleHeightPx: 2490,
} as const;

// Pre-computed PDF page dimensions (trim + bleed on each side).
export const BOOK_PDF_PAGE_WIDTH_IN = Number(
  (BOOK_SPEC.trimWidthIn + BOOK_SPEC.bleedIn * 2).toFixed(3)
); // 8.55"

export const BOOK_PDF_PAGE_HEIGHT_IN = Number(
  (BOOK_SPEC.trimHeightIn + BOOK_SPEC.bleedIn * 2).toFixed(3)
); // 8.55"

export type BookSpineResult = {
  widthIn: number;
  source: "configured" | "storycot_estimate";
};

export function getBookSpineWidthIn(pageCount: number): BookSpineResult {
  const configured = Number(process.env.STORYCOT_COVER_SPINE_WIDTH_IN);
  if (Number.isFinite(configured) && configured > 0) {
    return { widthIn: configured, source: "configured" };
  }
  return {
    widthIn: Number(
      Math.max(
        BOOK_SPEC.spineMinWidthIn,
        pageCount * BOOK_SPEC.spineWidthPerPage
      ).toFixed(3)
    ),
    source: "storycot_estimate",
  };
}
