import { rgb } from "pdf-lib";
import {
  BOOK_SPEC,
  BOOK_PDF_PAGE_WIDTH_IN,
  BOOK_PDF_PAGE_HEIGHT_IN,
} from "@/lib/print-books/bookConfig";
import {
  LULU_HARDCOVER_COVER_PAGE_HEIGHT_IN,
  LULU_HARDCOVER_COVER_PANEL_WIDTH_IN,
  LULU_INTERIOR_PDF_PAGE_HEIGHT_IN,
  LULU_INTERIOR_PDF_PAGE_WIDTH_IN,
  LULU_PAPERBACK_COVER_PAGE_HEIGHT_IN,
  LULU_FLAT_COVER_PANEL_WIDTH_IN,
  LULU_COIL_COVER_PAGE_HEIGHT_IN,
} from "@/lib/print-books/lulu";

export const POINTS_PER_INCH = 72;
export const PRINT_PAGE_WIDTH = BOOK_PDF_PAGE_WIDTH_IN * POINTS_PER_INCH;
export const PRINT_PAGE_HEIGHT = BOOK_PDF_PAGE_HEIGHT_IN * POINTS_PER_INCH;
export const BLEED = BOOK_SPEC.bleedIn * POINTS_PER_INCH;
export const FULL_BLEED_TEXT_SAFE_MARGIN =
  BOOK_SPEC.fullBleedTextSafeMarginIn * POINTS_PER_INCH;
export const BRAND_PURPLE = rgb(0.17, 0.13, 0.39);
export const BRAND_LILAC = rgb(0.53, 0.46, 0.9);
export const PDF_MAX_RASTER_PPI = 450;

/**
 * Extra inset applied to text on the spine side of a printed page, on top of
 * textSafeMargin.
 *
 * Coil binding punches holes that bite 0.312-0.375" into the spine edge, and
 * Lulu allows a +/-0.125" trim variance on top of that. At our base 0.5"
 * from-trim margin, text would sit ~0.125" from the punch holes and could be
 * clipped outright. Perfect bound doesn't punch, but text this close to a
 * glued square spine curves into the gutter and is hard to read.
 *
 * 0.375" puts text 0.875" from trim on the binding edge, matching Lulu's own
 * "0.5" margin + 0.375" gutter" guidance for coil and clearing their 0.2-0.3"
 * perfect-bound gutter minimum. Harmless for casewrap.
 *
 * Illustrations are unaffected — art is drawn full-bleed and is expected to
 * run under the punch holes.
 */
export const LULU_SPINE_SIDE_EXTRA_MARGIN = 0.375 * POINTS_PER_INCH;

/**
 * Lulu's recommended full-bleed interior margin grows with page count, because
 * thicker books lose more of the inner page into the binding. Values are the
 * "Recommended Interior Margin (full bleed)" column of Lulu's published table,
 * measured from the document (bleed) edge.
 */
export function getLuluInteriorTextSafeMargin(pageCount: number): number {
  if (pageCount <= 60) return 0.625 * POINTS_PER_INCH;
  if (pageCount <= 150) return 0.75 * POINTS_PER_INCH;
  if (pageCount <= 400) return 1.125 * POINTS_PER_INCH;
  if (pageCount <= 600) return 1.25 * POINTS_PER_INCH;
  return 1.375 * POINTS_PER_INCH;
}

export type PdfPageGeometry = {
  pageWidth: number;
  pageHeight: number;
  textSafeMargin: number;
  /** Points added to the binding-edge margin. Print only; 0/undefined for digital. */
  spineSideExtraMargin?: number;
};

export const STORYCOT_PDF_GEOMETRY: PdfPageGeometry = {
  pageWidth: PRINT_PAGE_WIDTH,
  pageHeight: PRINT_PAGE_HEIGHT,
  textSafeMargin: FULL_BLEED_TEXT_SAFE_MARGIN,
};

// Print only. The digital PDF (STORYCOT_PDF_GEOMETRY) deliberately keeps
// symmetric margins — it is read on screen, where there is no binding.
export const LULU_PDF_GEOMETRY: PdfPageGeometry = {
  pageWidth: LULU_INTERIOR_PDF_PAGE_WIDTH_IN * POINTS_PER_INCH,
  pageHeight: LULU_INTERIOR_PDF_PAGE_HEIGHT_IN * POINTS_PER_INCH,
  textSafeMargin: FULL_BLEED_TEXT_SAFE_MARGIN,
  spineSideExtraMargin: LULU_SPINE_SIDE_EXTRA_MARGIN,
};

export const LULU_COVER_PDF_GEOMETRY: PdfPageGeometry = {
  pageWidth: LULU_HARDCOVER_COVER_PANEL_WIDTH_IN * POINTS_PER_INCH,
  pageHeight: LULU_HARDCOVER_COVER_PAGE_HEIGHT_IN * POINTS_PER_INCH,
  textSafeMargin: FULL_BLEED_TEXT_SAFE_MARGIN,
};

// Perfect Bound / Coil have no casewrap board-wrap — each panel is just the
// trim plus bleed on its outer edge only (the spine-side inner edge has no
// bleed). Verified live against Lulu's /cover-dimensions/ endpoint on
// 2026-09-18: panel width 8.625" (not 8.75" — that would be trim + bleed on
// BOTH edges, which doesn't match the real total width Lulu returns).
// Spine varies by page count (paperback) or is ~0 (coil, no continuous
// spine) — cover builders fetch the real per-book spine live and compute
// full width at runtime; this geometry is panel-width/height only.
export const LULU_FLAT_COVER_PDF_GEOMETRY: PdfPageGeometry = {
  pageWidth: LULU_FLAT_COVER_PANEL_WIDTH_IN * POINTS_PER_INCH,
  pageHeight: LULU_PAPERBACK_COVER_PAGE_HEIGHT_IN * POINTS_PER_INCH,
  textSafeMargin: FULL_BLEED_TEXT_SAFE_MARGIN,
};

// Coil's page height matches paperback's (same 8.5" trim + 0.125" bleed);
// kept as a distinct export for callers that want to be explicit about
// which binding they're building for.
export const LULU_COIL_COVER_PDF_GEOMETRY: PdfPageGeometry = {
  pageWidth: LULU_FLAT_COVER_PANEL_WIDTH_IN * POINTS_PER_INCH,
  pageHeight: LULU_COIL_COVER_PAGE_HEIGHT_IN * POINTS_PER_INCH,
  textSafeMargin: FULL_BLEED_TEXT_SAFE_MARGIN,
};
