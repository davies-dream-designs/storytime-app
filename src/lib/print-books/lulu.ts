import type {
  BookProject,
  PrintBookOrder,
  PrintShippingAddress,
} from "@/types/printBook";

export const LULU_HARDCOVER_PACKAGE_ID = "0850X0850.FC.PRE.CW.080CW444.MXX";
export const LULU_SOFTCOVER_PACKAGE_ID = "0850X0850.FC.PRE.PB.080CW444.GXX";
export const LULU_HARDCOVER_MIN_PAGES = 24;
export const LULU_SOFTCOVER_MIN_PAGES = 20;
export const LULU_HARDCOVER_TRIM = '8.5" x 8.5"';
export const LULU_INTERIOR_PDF_PAGE_WIDTH_IN = 8.75;
export const LULU_INTERIOR_PDF_PAGE_HEIGHT_IN = 8.75;

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
    "hello@storycot.com"
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

async function getLuluAccessToken() {
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

function getLuluProductSpec(productKey: PrintBookOrder["productKey"]) {
  switch (productKey) {
    case "hardcover":
      return {
        packageId: LULU_HARDCOVER_PACKAGE_ID,
        minPageCount: LULU_HARDCOVER_MIN_PAGES,
        label: "hardcover",
      };
    case "softcover":
      return {
        packageId: LULU_SOFTCOVER_PACKAGE_ID,
        minPageCount: LULU_SOFTCOVER_MIN_PAGES,
        label: "softcover",
      };
    case "layflat":
      return undefined;
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

export function hasLuluPrintAssets(project: Pick<BookProject, "assets">) {
  return Boolean(
    project.assets.luluPrintPdfUrl &&
    project.assets.luluCoverPdfUrl &&
    project.assets.luluPrintPdfPageCount &&
    project.assets.luluPrintPdfPageCount >= LULU_HARDCOVER_MIN_PAGES
  );
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
      "Lulu fulfillment is currently configured for softcover and hardcover only."
    );
  }

  const interiorPdfUrl = project.assets.luluPrintPdfUrl;
  const coverPdfUrl = project.assets.luluCoverPdfUrl;
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
        quantity: 1,
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

export async function getLuluCoverDimensions(input: {
  pageCount: number;
  unit?: LuluCoverDimensions["unit"];
}): Promise<LuluCoverDimensions> {
  const raw = (await luluPost("/cover-dimensions/", {
    pod_package_id: LULU_HARDCOVER_PACKAGE_ID,
    interior_page_count: getLuluBillablePageCount(input.pageCount),
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
