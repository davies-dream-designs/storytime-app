import type { AgeBand, BookProject } from "@/types/printBook";

export type PrintProductKey = "softcover" | "hardcover" | "layflat";
export type CoverSpineSource = "configured" | "storycot_estimate";

export const PRINT_PRODUCTS = {
  softcover: {
    key: "softcover",
    label: "Softcover",
    badge: "Best value",
    provider: "Prodigi",
    format: "21x21cm square softcover",
    minPageCount: 20,
    maxPageCount: 300,
    pageStep: 2,
    basePages: 24,
    basePriceAud: 26.95,
    extraSpreadAud: 0.8,
    estimatedManufacturingAud: 13.5,
    estimatedShippingAud: 6.95,
    productionDays: "4-6 business days",
    description:
      "Affordable printed edition for everyday bedtime reading. Illustrations are already paid for.",
  },
  hardcover: {
    key: "hardcover",
    label: "Hardcover",
    badge: "Keepsake",
    provider: "Prodigi",
    format: "21x21cm square hardcover",
    minPageCount: 20,
    maxPageCount: 300,
    pageStep: 2,
    basePages: 24,
    basePriceAud: 39.95,
    extraSpreadAud: 1.1,
    estimatedManufacturingAud: 24,
    estimatedShippingAud: 7.95,
    productionDays: "5-7 business days",
    description:
      "Giftable keepsake edition with a rigid cover and printable spine when the book is thick enough.",
  },
  layflat: {
    key: "layflat",
    label: "Layflat",
    badge: "Premium",
    provider: "Prodigi",
    format: "21x21cm square layflat",
    minPageCount: 18,
    maxPageCount: 122,
    pageStep: 2,
    basePages: 24,
    basePriceAud: 59.95,
    extraSpreadAud: 1.8,
    estimatedManufacturingAud: 36,
    estimatedShippingAud: 8.95,
    productionDays: "5-8 business days",
    description:
      "Premium photo-book style option where spreads open flat for the strongest artwork presentation.",
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
    productionDays: string;
    description: string;
  }
>;

export function getStorycotPageCountForAgeBand(ageBand: AgeBand): number {
  switch (ageBand) {
    case "0-2":
      return 20;
    case "3-5":
      return 24;
    case "6-8":
      return 32;
  }
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
  void productKey;
  return pageCount;
}

function getUnsupportedReason(pageCount: number, productKey: PrintProductKey) {
  const product = PRINT_PRODUCTS[productKey];
  if (productKey === "softcover") {
    return "Softcover is temporarily unavailable in Australia while we source a local print route.";
  }

  if (productKey === "layflat") {
    return "Layflat is temporarily unavailable in Australia while we source a local print route.";
  }

  if (pageCount % product.pageStep !== 0) {
    return `${product.label} requires an even number of print pages. This story has ${pageCount}.`;
  }

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
