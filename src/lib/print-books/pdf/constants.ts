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

export type PdfPageGeometry = {
  pageWidth: number;
  pageHeight: number;
  textSafeMargin: number;
};

export const STORYCOT_PDF_GEOMETRY: PdfPageGeometry = {
  pageWidth: PRINT_PAGE_WIDTH,
  pageHeight: PRINT_PAGE_HEIGHT,
  textSafeMargin: FULL_BLEED_TEXT_SAFE_MARGIN,
};

export const LULU_PDF_GEOMETRY: PdfPageGeometry = {
  pageWidth: LULU_INTERIOR_PDF_PAGE_WIDTH_IN * POINTS_PER_INCH,
  pageHeight: LULU_INTERIOR_PDF_PAGE_HEIGHT_IN * POINTS_PER_INCH,
  textSafeMargin: FULL_BLEED_TEXT_SAFE_MARGIN,
};

export const LULU_COVER_PDF_GEOMETRY: PdfPageGeometry = {
  pageWidth: LULU_HARDCOVER_COVER_PANEL_WIDTH_IN * POINTS_PER_INCH,
  pageHeight: LULU_HARDCOVER_COVER_PAGE_HEIGHT_IN * POINTS_PER_INCH,
  textSafeMargin: FULL_BLEED_TEXT_SAFE_MARGIN,
};
