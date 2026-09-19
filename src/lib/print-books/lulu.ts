import type {
  BookProject,
  PrintBookOrder,
  PrintShippingAddress,
} from "@/types/printBook";

export const LULU_HARDCOVER_PACKAGE_ID = "0850X0850.FC.PRE.CW.080CW444.MXX";
export const LULU_HARDCOVER_MIN_PAGES = 24;
export const LULU_HARDCOVER_TRIM = '8.5" x 8.5"';
export const LULU_TRIM_WIDTH_IN = 8.5;
export const LULU_TRIM_HEIGHT_IN = 8.5;
export const LULU_INTERIOR_PDF_PAGE_WIDTH_IN = 8.75;
export const LULU_INTERIOR_PDF_PAGE_HEIGHT_IN = 8.75;
export const LULU_HARDCOVER_COVER_PAGE_WIDTH_IN = 19;
export const LULU_HARDCOVER_COVER_PAGE_HEIGHT_IN = 10.25;
export const LULU_HARDCOVER_COVER_SPINE_WIDTH_IN = 0.25;
export const LULU_HARDCOVER_CASEWRAP_WRAP_IN =
  (LULU_HARDCOVER_COVER_PAGE_HEIGHT_IN - LULU_TRIM_HEIGHT_IN) / 2;
export const LULU_HARDCOVER_COVER_PANEL_WIDTH_IN =
  (LULU_HARDCOVER_COVER_PAGE_WIDTH_IN - LULU_HARDCOVER_COVER_SPINE_WIDTH_IN) /
  2;

// Perfect Bound, standard color. Verified live against Lulu's production
// print-job-cost-calculations/ endpoint on 2026-09-18: valid for the square
// 8.5x8.5 trim, but Lulu enforces a hard 32-page minimum for this binding
// (400 error below 32pp, not a soft warning) — the "page size" that blocked
// this SKU previously was page *count*, not trim dimensions.
export const LULU_PAPERBACK_PACKAGE_ID = "0850X0850.FC.STD.PB.080CW444.MXX";
export const LULU_PAPERBACK_MIN_PAGES = 32;
// Height: trim (8.5") + bleed (0.125") top and bottom.
export const LULU_PAPERBACK_COVER_PAGE_HEIGHT_IN = 8.75;

// Coil Bound, standard color. Verified live: valid from 2 pages up (no
// meaningful floor for our books), no upper page-count ceiling either —
// the cheap option for books that fall under the Perfect Bound 32pp floor.
export const LULU_COIL_PACKAGE_ID = "0850X0850.FC.STD.CO.060UW444.MXX";
export const LULU_COIL_MIN_PAGES = 2;
export const LULU_COIL_COVER_PAGE_HEIGHT_IN = 8.75;

// Panel width for the non-wrap bindings (Perfect Bound / Coil): trim (8.5")
// + bleed (0.125") on the OUTER edge only — the spine-side inner edge gets
// no bleed. Verified live against Lulu's /cover-dimensions/ endpoint on
// 2026-09-18: e.g. Perfect Bound @ 32pp returns total width 17.382" and
// spine ~0.132" at that page count, i.e. panel width = (17.382 - 0.132) / 2
// ≈ 8.625", not 8.75" (which would double-count bleed on the spine edge).
// Coil confirmed to return a constant 17.25" width regardless of page count
// — i.e. spine ≈ 0" (no continuous spine — front/back are separate flat
// panels joined by punched holes), consistent with 2 * 8.625 = 17.25.
export const LULU_FLAT_COVER_PANEL_WIDTH_IN = 8.625;

export type LuluShippingLevel =
  | "MAIL"
  | "PRIORITY_MAIL"
  | "GROUND_HD"
  | "GROUND_BUS"
  | "GROUND"
  | "EXPEDITED"
  | "EXPRESS";

type LuluToken = {
  access_token?: unknown;
  expires_in?: unknown;
};

type LuluMoney = {
  total_cost_excl_tax?: unknown;
  total_cost_incl_tax?: unknown;
  total_tax?: unknown;
  tax_rate?: unknown;
};

export type LuluQuoteResponse = {
  currency?: unknown;
  line_item_costs?: unknown;
  shipping_cost?: LuluMoney;
  fulfillment_cost?: LuluMoney;
  total_cost_excl_tax?: unknown;
  total_cost_incl_tax?: unknown;
  total_discount_amount?: unknown;
  total_tax?: unknown;
  fees?: unknown;
};

export type LuluCoverDimensions = {
  width: string;
  height: string;
  unit: "pt" | "mm" | "inch";
};

export type LuluSubmissionResult = {
  orderId: string;
  externalStatus: string;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

export function resetLuluTokenCacheForTests() {
  cachedToken = null;
}

function getLuluBaseUrl() {
  return (process.env.LULU_API_BASE_URL ?? "https://api.lulu.com").replace(
    /\/$/,
    ""
  );
}

function getLuluBasicAuth() {
  if (process.env.LULU_BASIC_AUTH) {
    return `Basic ${process.env.LULU_BASIC_AUTH}`;
  }

  const clientKey = process.env.LULU_CLIENT_KEY;
  const clientSecret = process.env.LULU_CLIENT_SECRET;
  if (!clientKey || !clientSecret) return undefined;

  return `Basic ${Buffer.from(`${clientKey}:${clientSecret}`).toString(
    "base64"
  )}`;
}

function getLuluContactEmail() {
  return (
    process.env.LULU_CONTACT_EMAIL ??
    process.env.GMAIL_USER ??
    "hello@storycot.com.au"
  );
}

function getLuluShippingLevel(): LuluShippingLevel {
  const value = process.env.LULU_SHIPPING_LEVEL;
  if (
    value === "MAIL" ||
    value === "PRIORITY_MAIL" ||
    value === "GROUND_HD" ||
    value === "GROUND_BUS" ||
    value === "GROUND" ||
    value === "EXPEDITED" ||
    value === "EXPRESS"
  ) {
    return value;
  }

  return "MAIL";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

async function readResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function luluErrorMessage(body: unknown) {
  if (typeof body === "string") return body;
  if (body && typeof body === "object") {
    if ("detail" in body && typeof body.detail === "string") {
      return body.detail;
    }
    if ("message" in body && typeof body.message === "string") {
      return body.message;
    }
  }
  return "Lulu request failed.";
}

export async function getLuluAccessToken() {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.token;
  }

  const authorization = getLuluBasicAuth();
  if (!authorization) {
    throw new Error(
      "Lulu credentials are not configured. Set LULU_BASIC_AUTH or LULU_CLIENT_KEY/LULU_CLIENT_SECRET."
    );
  }

  const response = await fetch(
    `${getLuluBaseUrl()}/auth/realms/glasstree/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    }
  );
  const body = await readResponse(response);
  if (!response.ok) throw new Error(luluErrorMessage(body));

  const tokenBody = body as LuluToken;
  const token = stringValue(tokenBody.access_token);
  if (!token) {
    throw new Error("Lulu token response did not include an access token.");
  }

  const expiresIn =
    typeof tokenBody.expires_in === "number" ? tokenBody.expires_in : 300;
  cachedToken = { token, expiresAt: now + expiresIn * 1000 };
  return token;
}

async function luluPost(path: string, payload: unknown) {
  const token = await getLuluAccessToken();
  const response = await fetch(`${getLuluBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
    body: JSON.stringify(payload),
  });
  const body = await readResponse(response);
  if (!response.ok) throw new Error(luluErrorMessage(body));
  return body;
}

function splitName(name: string | undefined) {
  const parts = (name ?? "Storycot Customer").trim().split(/\s+/);
  return {
    firstName: parts[0] ?? "Storycot",
    lastName: parts.slice(1).join(" ") || "Customer",
  };
}

export function toLuluShippingAddress(shipping: PrintShippingAddress) {
  return {
    name: shipping.name ?? "Storycot customer",
    email: shipping.email,
    phone_number: shipping.phone ?? "+61 0000 0000",
    street1: shipping.line1,
    street2: shipping.line2 ?? "",
    city: shipping.city,
    state_code: shipping.state ?? "",
    postcode: shipping.postalCode,
    country_code: shipping.countryCode,
  };
}

export function getLuluProductSpec(productKey: PrintBookOrder["productKey"]) {
  switch (productKey) {
    case "hardcover":
      return {
        packageId: LULU_HARDCOVER_PACKAGE_ID,
        minPageCount: LULU_HARDCOVER_MIN_PAGES,
        label: "hardcover",
      };
    case "paperback":
      return {
        packageId: LULU_PAPERBACK_PACKAGE_ID,
        minPageCount: LULU_PAPERBACK_MIN_PAGES,
        label: "paperback",
      };
    case "coil":
      return {
        packageId: LULU_COIL_PACKAGE_ID,
        minPageCount: LULU_COIL_MIN_PAGES,
        label: "coil",
      };
  }
}

export function getLuluBillablePageCount(
  pageCount: number,
  productKey: PrintBookOrder["productKey"] = "hardcover"
) {
  const productSpec = getLuluProductSpec(productKey);
  return Math.max(pageCount, productSpec?.minPageCount ?? pageCount);
}

export function isLuluPrintProvider() {
  return process.env.STORYCOT_PRINT_PROVIDER === "lulu";
}

/**
 * Checks whether a book has the Lulu-formatted assets needed to order the
 * given product.
 *
 * Hardcover requires its cover PDF to already exist — it's still built
 * eagerly at book-build time, unchanged. Paperback/coil covers are built
 * lazily on first order of that format (see lazyCovers.ts) so they're
 * intentionally NOT required here — only the shared interior PDF (same for
 * all three bindings, same 8.5x8.5 trim) needs to already exist. Checkout
 * can proceed for a paperback/coil order even if that specific cover
 * hasn't been generated yet; it's generated just before Lulu submission.
 */
export function hasLuluPrintAssets(
  project: Pick<BookProject, "assets">,
  productKey: PrintBookOrder["productKey"] = "hardcover"
) {
  const spec = getLuluProductSpec(productKey);
  const hasRequiredCover =
    productKey === "hardcover"
      ? Boolean(project.assets.luluCoverPdfUrl)
      : true;
  return Boolean(
    project.assets.luluPrintPdfUrl &&
      hasRequiredCover &&
      project.assets.luluPrintPdfPageCount &&
      project.assets.luluPrintPdfPageCount >= spec.minPageCount
  );
}

/**
 * Selects the right cover PDF URL for a given product. Hardcover always
 * uses the eagerly-built `luluCoverPdfUrl`; paperback/coil covers are
 * generated lazily on first order (see lazyCovers.ts) and cached in
 * `luluFlatCoverPdfUrlByProduct`. Note this does NOT trigger generation —
 * callers that need a guaranteed cover before submission must call
 * getOrCreateLuluCoverPdfUrl first.
 */
export function getLuluCoverPdfUrlForProduct(
  project: Pick<BookProject, "assets">,
  productKey: PrintBookOrder["productKey"]
): string | undefined {
  if (productKey === "hardcover") {
    return project.assets.luluCoverPdfUrl;
  }
  return project.assets.luluFlatCoverPdfUrlByProduct?.[productKey];
}

export function buildLuluPrintJobPayload(input: {
  project: BookProject;
  order: PrintBookOrder;
  shipping: PrintShippingAddress;
}) {
  const { project, order, shipping } = input;
  const productSpec = getLuluProductSpec(order.productKey);
  if (!productSpec) {
    throw new Error(
      "Lulu fulfillment is currently configured for hardcover only."
    );
  }

  const interiorPdfUrl = project.assets.luluPrintPdfUrl;
  const coverPdfUrl = getLuluCoverPdfUrlForProduct(project, order.productKey);
  const pageCount = project.assets.luluPrintPdfPageCount ?? project.pageCount;

  if (pageCount < productSpec.minPageCount) {
    throw new Error(
      `Lulu ${productSpec.label} requires at least ${productSpec.minPageCount} interior pages. This ${pageCount}-page book needs a Lulu-specific padded PDF export before fulfillment.`
    );
  }

  if (!interiorPdfUrl) {
    throw new Error("Lulu-specific interior print PDF is missing.");
  }
  if (!coverPdfUrl) {
    throw new Error("Lulu-specific cover PDF is missing.");
  }

  const { firstName, lastName } = splitName(shipping.name);
  const shippingLevel = getLuluShippingLevel();

  return {
    contact_email: getLuluContactEmail(),
    external_id: `storycot-${project.id}`,
    line_items: [
      {
        external_id: `${project.id}-${order.productKey}`,
        printable_normalization: {
          cover: {
            source_url: coverPdfUrl,
          },
          interior: {
            source_url: interiorPdfUrl,
          },
          pod_package_id: productSpec.packageId,
        },
        quantity: order.quantity ?? 1,
        title: order.productLabel,
      },
    ],
    production_delay: Number(process.env.LULU_PRODUCTION_DELAY_HOURS ?? 120),
    shipping_address: {
      ...toLuluShippingAddress(shipping),
      name: shipping.name ?? `${firstName} ${lastName}`,
    },
    shipping_level: shippingLevel,
    metadata: {
      source: "storycot",
      projectId: project.id,
      sourceStoryId: project.sourceStoryId,
      checkoutSessionId: order.checkoutSessionId,
    },
  };
}

export function buildLuluQuotePayload(input: {
  pageCount: number;
  shipping: PrintShippingAddress;
  productKey?: PrintBookOrder["productKey"];
  quantity?: number;
  shippingLevel?: LuluShippingLevel;
}) {
  const productSpec = getLuluProductSpec(input.productKey ?? "hardcover");
  if (!productSpec) {
    throw new Error("Lulu quote is not configured for this product.");
  }

  return {
    line_items: [
      {
        page_count: getLuluBillablePageCount(input.pageCount, input.productKey),
        pod_package_id: productSpec.packageId,
        quantity: input.quantity ?? 1,
      },
    ],
    shipping_address: toLuluShippingAddress(input.shipping),
    shipping_option: input.shippingLevel ?? getLuluShippingLevel(),
  };
}

function getLuluMoney(input: unknown) {
  if (!input || typeof input !== "object") return undefined;
  const money = input as LuluMoney;
  const value =
    money.total_cost_excl_tax ?? money.total_cost_incl_tax;
  return parseLuluMoney(value);
}

/**
 * Sums only the book manufacturing line-item cost from a Lulu quote,
 * excluding shipping/fulfillment/fees — shipping is quoted and charged
 * separately per delivery address at checkout time.
 *
 * Asserts the quote is actually denominated in AUD before trusting the
 * number — the shipping address alone doesn't guarantee currency, and this
 * is real money going into pricing math, so we fail loudly instead of
 * silently pricing an AUD checkout off a USD (or other currency) figure.
 */
export function getLuluLineItemCostAud(quote: LuluQuoteResponse) {
  if (quote.currency !== undefined && quote.currency !== "AUD") {
    throw new Error(
      `Lulu quote returned currency "${String(quote.currency)}", expected AUD.`
    );
  }
  const lineItems = Array.isArray(quote.line_item_costs)
    ? quote.line_item_costs
    : [];
  const total = lineItems.reduce(
    (sum: number, item: unknown) => sum + (getLuluMoney(item) ?? 0),
    0
  );
  if (total <= 0) {
    throw new Error(
      "Lulu quote response did not include a usable line item cost."
    );
  }
  return Number(total.toFixed(2));
}

export async function quoteLuluPrintJob(input: {
  pageCount: number;
  shipping: PrintShippingAddress;
  productKey?: PrintBookOrder["productKey"];
  quantity?: number;
  shippingLevel?: LuluShippingLevel;
}): Promise<LuluQuoteResponse> {
  return (await luluPost(
    "/print-job-cost-calculations/",
    buildLuluQuotePayload(input)
  )) as LuluQuoteResponse;
}

function parseLuluMoney(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function getLuluShippingAmountAud(quote: LuluQuoteResponse) {
  const shippingCost = quote.shipping_cost;
  const rawAmount =
    shippingCost && typeof shippingCost === "object"
      ? ((shippingCost as LuluMoney).total_cost_incl_tax ??
        (shippingCost as LuluMoney).total_cost_excl_tax)
      : undefined;
  const amount = parseLuluMoney(rawAmount);
  if (amount === undefined || amount < 0) {
    throw new Error(
      "Lulu shipping quote response did not include a shipping cost."
    );
  }
  return Number(amount.toFixed(2));
}

export async function getLuluCoverDimensions(input: {
  pageCount: number;
  productKey?: PrintBookOrder["productKey"];
  unit?: LuluCoverDimensions["unit"];
  packageId?: string;
}): Promise<LuluCoverDimensions> {
  const raw = (await luluPost("/cover-dimensions/", {
    pod_package_id: input.packageId ?? LULU_HARDCOVER_PACKAGE_ID,
    // Product-specific floor matters here: a 4-page coil book is valid and
    // must stay 4pp; treating it as default hardcover would incorrectly
    // inflate it to the hardcover's 24pp floor for geometry lookup.
    interior_page_count: getLuluBillablePageCount(
      input.pageCount,
      input.productKey
    ),
    unit: input.unit ?? "pt",
  })) as { width?: unknown; height?: unknown; unit?: unknown };

  const width = stringValue(raw.width);
  const height = stringValue(raw.height);
  if (
    !width ||
    !height ||
    (raw.unit !== "pt" && raw.unit !== "mm" && raw.unit !== "inch")
  ) {
    throw new Error("Lulu cover dimensions response was incomplete.");
  }

  return { width, height, unit: raw.unit };
}

/**
 * Live spine width (inches) for the flat, non-wrap bindings (paperback/
 * coil) at a given page count — fetched from Lulu's /cover-dimensions/
 * rather than estimated, since spine width varies by page count for
 * paperback and Lulu is the source of truth for exact print dimensions.
 * Not used for hardcover, which has a fixed casewrap spine constant.
 */
export async function getLuluFlatCoverSpineWidthIn(
  pageCount: number,
  productKey: "paperback" | "coil"
): Promise<number> {
  const productSpec = getLuluProductSpec(productKey);
  if (!productSpec) {
    throw new Error(`Lulu product spec is missing for "${productKey}".`);
  }
  const dims = await getLuluCoverDimensions({
    pageCount,
    productKey,
    packageId: productSpec.packageId,
    unit: "inch",
  });
  const totalWidthIn = Number(dims.width);
  if (!Number.isFinite(totalWidthIn)) {
    throw new Error("Lulu cover dimensions response had a non-numeric width.");
  }
  const spineWidthIn = totalWidthIn - 2 * LULU_FLAT_COVER_PANEL_WIDTH_IN;
  // Coil resolves to ~0 by design (no continuous spine); never return a
  // negative value even if Lulu's live figure is a hair under our panel
  // width estimate due to rounding.
  return Math.max(0, Number(spineWidthIn.toFixed(3)));
}

export async function submitLuluPrintJob(
  payload: unknown
): Promise<LuluSubmissionResult> {
  const raw = (await luluPost("/print-jobs/", payload)) as {
    id?: unknown;
    print_job_id?: unknown;
    status?: { name?: unknown };
  };
  const orderId =
    stringValue(raw.id) ??
    (typeof raw.print_job_id === "number"
      ? String(raw.print_job_id)
      : undefined);
  if (!orderId) throw new Error("Lulu did not return a print job ID.");

  return {
    orderId,
    externalStatus: stringValue(raw.status?.name) ?? "created",
  };
}
