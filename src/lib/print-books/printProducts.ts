import type { AgeBand, BookProject } from "@/types/printBook";

export type PrintProductKey = "hardcover";
export type CoverSpineSource = "configured" | "storycot_estimate";

export const PRINT_PRODUCTS = {
  hardcover: {
    key: "hardcover",
    label: "Hardcover",
    badge: "Keepsake",
    provider: "Lulu",
    format: '8.5" square hardcover casewrap',
    minPageCount: 20,
    maxPageCount: 300,
    pageStep: 2,
    basePages: 24,
    basePriceAud: 39.95,
    extraSpreadAud: 1.1,
    estimatedManufacturingAud: 18.5,
    estimatedShippingAud: 15.15,
    description:
      "Giftable keepsake edition with a rigid casewrap cover and premium colour pages.",
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
    basePages: number;
    basePriceAud: number;
    extraSpreadAud: number;
    estimatedManufacturingAud: number;
    estimatedShippingAud: number;
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

export function quotePrintProduct(
  project: Pick<BookProject, "pageCount">,
  productKey: PrintProductKey
) {
  const product = PRINT_PRODUCTS[productKey];
  const adjustedPageCount = getAdjustedPageCountForProduct(
    project.pageCount,
    productKey
  );
  const unsupportedReason = getUnsupportedReason(adjustedPageCount, productKey);
  const extraSpreads = Math.max(
    0,
    Math.ceil((adjustedPageCount - product.basePages) / 2)
  );
  const priceAud = Number(
    (product.basePriceAud + extraSpreads * product.extraSpreadAud).toFixed(2)
  );

  return {
    ...product,
    pageCount: adjustedPageCount,
    needsPadding: adjustedPageCount > project.pageCount,
    paddingPages: adjustedPageCount - project.pageCount,
    priceAud,
    isWithinSpecs: !unsupportedReason,
    unsupportedReason,
  };
}

export function getPrintProductQuotes(project: Pick<BookProject, "pageCount">) {
  return (Object.keys(PRINT_PRODUCTS) as PrintProductKey[]).map((key) =>
    quotePrintProduct(project, key)
  );
}
