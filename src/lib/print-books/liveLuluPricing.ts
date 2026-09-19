import { db } from "@/lib/db";
import {
  getLuluLineItemCostAud,
  getLuluProductSpec,
  quoteLuluPrintJob,
} from "@/lib/print-books/lulu";
import { PRINT_PRODUCTS, type PrintProductKey } from "@/lib/print-books/printProducts";
import type { PrintShippingAddress } from "@/types/printBook";

// Manufacturing cost is address-independent (only shipping varies by
// destination), so a fixed placeholder AU address is fine for sampling
// Lulu's book price — it's never shown to a customer or charged.
const SAMPLE_SHIPPING_ADDRESS: PrintShippingAddress = {
  name: "Storycot Pricing Check",
  line1: "1 Example St",
  city: "Sydney",
  state: "NSW",
  postalCode: "2000",
  countryCode: "AU",
};

// How stale a cached price is allowed to get before checkout prefers a
// synchronous live Lulu call over trusting the cache. The cron job
// (pollLuluPricing) is expected to refresh well within this window; this is
// a safety net for when the cron hasn't run recently (e.g. deploy gap).
const MAX_CACHE_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

// Absolute ceiling on cache age for the "live retry also failed" last-resort
// fallback. Beyond this, Lulu's real pricing has likely drifted too far to
// trust, so checkout should block instead of charging a very old price.
const MAX_STALE_FALLBACK_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface LiveLuluPriceModel {
  sampleLowPageCount: number;
  sampleLowCostAudCents: number;
  sampleHighPageCount: number;
  sampleHighCostAudCents: number;
}

function interpolateCostAudCents(
  model: LiveLuluPriceModel,
  pageCount: number
): number {
  const { sampleLowPageCount, sampleLowCostAudCents, sampleHighPageCount, sampleHighCostAudCents } = model;
  if (sampleHighPageCount === sampleLowPageCount) {
    return sampleLowCostAudCents;
  }
  const slope =
    (sampleHighCostAudCents - sampleLowCostAudCents) /
    (sampleHighPageCount - sampleLowPageCount);
  const cents =
    sampleLowCostAudCents + slope * (pageCount - sampleLowPageCount);
  return Math.max(0, Math.round(cents));
}

/**
 * Queries Lulu live for the manufacturing cost of a product at two sampled
 * page counts (the product's minimum, and minimum+16 as a second point to
 * derive the per-page slope) and writes the result to luluPriceCache. Used
 * by the pollLuluPricing cron and as a synchronous fallback when the cache
 * is missing or stale.
 */
export async function refreshLuluPriceCache(
  productKey: PrintProductKey
): Promise<LiveLuluPriceModel> {
  // Sample from Lulu's own technical SKU floor, not Storycot's (potentially
  // lower) catalog minimum — quoting below Lulu's real floor 400s (as
  // verified live: Perfect Bound rejects anything under 32pp even though
  // our own hardcover catalog minimum is 20pp, auto-padded elsewhere via
  // getLuluBillablePageCount).
  const luluSpec = getLuluProductSpec(productKey);
  const lowPageCount = luluSpec?.minPageCount ?? PRINT_PRODUCTS[productKey].minPageCount;
  const highPageCount = lowPageCount + 16;

  // Sequential rather than Promise.all: getLuluAccessToken's in-memory cache
  // isn't populated yet on the first call of a cold run, so two concurrent
  // calls would race and both attempt a fresh OAuth exchange. Sequencing
  // also keeps this cron-driven poller gentle on Lulu's auth endpoint.
  const lowQuote = await quoteLuluPrintJob({
    pageCount: lowPageCount,
    shipping: SAMPLE_SHIPPING_ADDRESS,
    productKey,
    quantity: 1,
  });
  const highQuote = await quoteLuluPrintJob({
    pageCount: highPageCount,
    shipping: SAMPLE_SHIPPING_ADDRESS,
    productKey,
    quantity: 1,
  });

  const model: LiveLuluPriceModel = {
    sampleLowPageCount: lowPageCount,
    sampleLowCostAudCents: Math.round(getLuluLineItemCostAud(lowQuote) * 100),
    sampleHighPageCount: highPageCount,
    sampleHighCostAudCents: Math.round(
      getLuluLineItemCostAud(highQuote) * 100
    ),
  };

  await db.luluPriceCache.upsert({
    productKey,
    ...model,
    rawResponse: { lowQuote, highQuote } as Record<string, unknown>,
  });

  return model;
}

export class LuluPricingUnavailableError extends Error {
  constructor(productKey: string, cause?: unknown) {
    super(
      `Live Lulu pricing is unavailable for "${productKey}" (cache empty/stale and the live fallback quote also failed).`,
      { cause }
    );
    this.name = "LuluPricingUnavailableError";
  }
}

/**
 * Returns the live Lulu manufacturing cost (AUD) for a product at a given
 * page count. Reads the cron-refreshed cache first; if the cache is missing
 * or older than MAX_CACHE_AGE_MS, falls back to a synchronous live Lulu
 * quote (still correct, just slower and subject to Lulu's own rate limits
 * for that one request). Throws LuluPricingUnavailableError if both the
 * cache and the live fallback fail — callers (checkout routes) should treat
 * this as "block checkout, ask the customer to retry shortly" rather than
 * silently charging a stale/static price.
 */
export async function getLiveManufacturingCostAud(
  productKey: PrintProductKey,
  pageCount: number
): Promise<number> {
  const cached = await db.luluPriceCache.getByProductKey(productKey);
  if (cached) {
    const ageMs = Date.now() - new Date(cached.quotedAt).getTime();
    if (ageMs <= MAX_CACHE_AGE_MS) {
      const cents = interpolateCostAudCents(cached, pageCount);
      return Number((cents / 100).toFixed(2));
    }
  }

  try {
    const model = await refreshLuluPriceCache(productKey);
    const cents = interpolateCostAudCents(model, pageCount);
    return Number((cents / 100).toFixed(2));
  } catch (error) {
    // A moderately stale cache is still better than blocking checkout over
    // a momentary Lulu blip — but only up to MAX_STALE_FALLBACK_AGE_MS.
    // Beyond that, pricing has likely drifted too far to trust silently.
    if (cached) {
      const ageMs = Date.now() - new Date(cached.quotedAt).getTime();
      if (ageMs <= MAX_STALE_FALLBACK_AGE_MS) {
        const cents = interpolateCostAudCents(cached, pageCount);
        return Number((cents / 100).toFixed(2));
      }
    }
    throw new LuluPricingUnavailableError(productKey, error);
  }
}
