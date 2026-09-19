import type { AgeBand, BookProject } from "@/types/printBook";
import { computePrintBookPriceAud } from "@/lib/print-books/margin";
import {
  getLiveManufacturingCostAud,
  LuluPricingUnavailableError,
} from "@/lib/print-books/liveLuluPricing";

export type PrintProductKey = "hardcover" | "paperback" | "coil";
export type CoverSpineSource = "configured" | "storycot_estimate";

// Prices are NOT stored here — they're derived at request time from a live
// (cache-backed) Lulu manufacturing-cost quote, see quotePrintProduct below.
// This table only holds static catalog metadata (labels, formats, and the
// page-count range Lulu actually accepts for each binding, verified against
// Lulu's live production API on 2026-09-18).
export const PRINT_PRODUCTS = {
  hardcover: {
    key: "hardcover",
    label: "Hardcover",
    badge: "Keepsake",
    provider: "Lulu",
    format: '8.5" square hardcover casewrap',
    // Storycot's own business-level minimum (below Lulu's own SKU floor of
    // 24pp — that gap is auto-padded with quiet pages by
    // getLuluBillablePageCount before billing/printing, unchanged behaviour).
    minPageCount: 20,
    maxPageCount: 300,
    pageStep: 2,
    description:
      "Giftable keepsake edition with a rigid casewrap cover and premium colour pages.",
  },
  paperback: {
    key: "paperback",
    label: "Paperback",
    badge: "Everyday",
    provider: "Lulu",
    format: '8.5" square perfect-bound paperback',
    minPageCount: 32,
    maxPageCount: 800,
    pageStep: 2,
    description:
      "Our most affordable printed edition — a glued perfect-bound paperback, standard colour interior.",
  },
  coil: {
    key: "coil",
    label: "Coil bound",
    badge: "Lay-flat",
    provider: "Lulu",
    format: '8.5" square coil-bound paperback',
    minPageCount: 4,
    maxPageCount: 470,
    pageStep: 2,
    description:
      "A budget-friendly coil-bound edition that lies flat for easy reading — great for shorter books.",
  },
} as const satisfies Record<
  PrintProductKey,
  {
    key: PrintProductKey;
    label: string;
    badge: string;
    provider: string;
    format: string;
    minPageCount: number;
    maxPageCount: number;
    pageStep: number;
    description: string;
  }
>;

export function getStorycotPageCountForAgeBand(ageBand: AgeBand): number {
  switch (ageBand) {
    case "baby-drift":
    case "little-listener":
    case "toddler-tale":
      return 24;
    case "first-adventure":
    case "preschool-story":
      return 28;
    case "big-kid-chapter":
      return 32;
    case "young-reader-short":
      return 40;
    case "young-reader-classic":
      return 56;
    case "young-reader-long":
      return 72;
    case "0-2":
      return 20;
    case "3-5":
      return 28;
    case "6-8":
      return 32;
  }
}

export function getStorycotStorySpreadCountForAgeBand(
  ageBand: AgeBand
): number {
  switch (ageBand) {
    case "baby-drift":
    case "little-listener":
    case "toddler-tale":
      return 8;
    case "first-adventure":
    case "preschool-story":
      return 10;
    case "big-kid-chapter":
      return 12;
    case "young-reader-short":
      return 16;
    case "young-reader-classic":
      return 24;
    case "young-reader-long":
      return 32;
    case "0-2":
      return 6;
    case "3-5":
      return 10;
    case "6-8":
      return 12;
  }
}

export function getStorycotIllustratedStorySpreadCountForAgeBand(
  ageBand: AgeBand
): number {
  switch (ageBand) {
    case "big-kid-chapter":
      return 9;
    case "young-reader-short":
      return 8;
    case "young-reader-classic":
      return 10;
    case "young-reader-long":
      return 12;
    default:
      return getStorycotStorySpreadCountForAgeBand(ageBand);
  }
}

export function getStorycotIllustrationCountForAgeBand(
  ageBand: AgeBand
): number {
  return getStorycotIllustratedStorySpreadCountForAgeBand(ageBand) + 1;
}

export const PRINT_PRODUCT_KEYS = Object.keys(
  PRINT_PRODUCTS
) as PrintProductKey[];

export function isPrintProductKey(value: unknown): value is PrintProductKey {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(PRINT_PRODUCTS, value)
  );
}

export { getBookSpineWidthIn as getStorycotSpineWidth } from "@/lib/print-books/bookConfig";

export function getAdjustedPageCountForProduct(
  pageCount: number,
  productKey: PrintProductKey
): number {
  const product = PRINT_PRODUCTS[productKey];
  if (pageCount % product.pageStep !== 0) {
    return pageCount + (product.pageStep - (pageCount % product.pageStep));
  }
  return pageCount;
}

function getUnsupportedReason(pageCount: number, productKey: PrintProductKey) {
  const product = PRINT_PRODUCTS[productKey];
  if (pageCount < product.minPageCount) {
    return `${product.label} requires at least ${product.minPageCount} print pages. This story has ${pageCount}.`;
  }

  if (pageCount > product.maxPageCount) {
    return `${product.label} supports up to ${product.maxPageCount} print pages. This story has ${pageCount}.`;
  }

  return undefined;
}

export interface PrintProductQuote {
  key: PrintProductKey;
  label: string;
  badge: string;
  provider: string;
  format: string;
  description: string;
  pageCount: number;
  needsPadding: boolean;
  paddingPages: number;
  isWithinSpecs: boolean;
  unsupportedReason?: string;
  /** Live Lulu manufacturing cost (AUD, excl. shipping/tax). */
  manufacturingCostAud?: number;
  /** manufacturingCostAud * margin multiplier, what the customer is charged (excl. shipping). */
  priceAud?: number;
  /** True if live pricing could not be obtained — priceAud will be undefined. */
  pricingUnavailable: boolean;
}

/**
 * Quotes a single print product for a book, pulling the manufacturing cost
 * from the live (cache-backed) Lulu pricing module rather than a hardcoded
 * formula — see liveLuluPricing.ts. If pricing is unavailable (cache empty
 * and the live fallback also failed), priceAud/manufacturingCostAud are left
 * undefined and pricingUnavailable is true; callers (checkout routes) must
 * treat that as "block, ask the customer to retry" rather than falling back
 * to a stale/static number.
 */
export async function quotePrintProduct(
  project: Pick<BookProject, "pageCount">,
  productKey: PrintProductKey
): Promise<PrintProductQuote> {
  const product = PRINT_PRODUCTS[productKey];
  const adjustedPageCount = getAdjustedPageCountForProduct(
    project.pageCount,
    productKey
  );
  const unsupportedReason = getUnsupportedReason(adjustedPageCount, productKey);
  const isWithinSpecs = !unsupportedReason;

  const base: PrintProductQuote = {
    key: product.key,
    label: product.label,
    badge: product.badge,
    provider: product.provider,
    format: product.format,
    description: product.description,
    pageCount: adjustedPageCount,
    needsPadding: adjustedPageCount > project.pageCount,
    paddingPages: adjustedPageCount - project.pageCount,
    isWithinSpecs,
    unsupportedReason,
    pricingUnavailable: false,
  };

  // Don't bother pricing a format this book can't use anyway.
  if (!isWithinSpecs) return base;

  try {
    const manufacturingCostAud = await getLiveManufacturingCostAud(
      productKey,
      adjustedPageCount
    );
    return {
      ...base,
      manufacturingCostAud,
      priceAud: computePrintBookPriceAud(manufacturingCostAud),
    };
  } catch (error) {
    if (error instanceof LuluPricingUnavailableError) {
      return { ...base, pricingUnavailable: true };
    }
    throw error;
  }
}

export async function getPrintProductQuotes(
  project: Pick<BookProject, "pageCount">
): Promise<PrintProductQuote[]> {
  return Promise.all(
    (Object.keys(PRINT_PRODUCTS) as PrintProductKey[]).map((key) =>
      quotePrintProduct(project, key)
    )
  );
}
