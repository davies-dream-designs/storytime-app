import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLuluQuotePayload,
  getLuluBillablePageCount,
  getLuluCoverDimensions,
  getLuluCoverPdfUrlForProduct,
  getLuluFlatCoverSpineWidthIn,
  getLuluShippingAmountAud,
  hasLuluPrintAssets,
  quoteLuluPrintJob,
  resetLuluTokenCacheForTests,
} from "@/lib/print-books/lulu";
import type { BookProject, PrintShippingAddress } from "@/types/printBook";

const previousEnv = process.env;

const shipping: PrintShippingAddress = {
  name: "Lulu Reader",
  email: "reader@example.com",
  phone: "+61 2 5555 0100",
  line1: "1 Print Street",
  city: "Sydney",
  state: "NSW",
  postalCode: "2000",
  countryCode: "AU",
};

afterEach(() => {
  vi.restoreAllMocks();
  resetLuluTokenCacheForTests();
  process.env = { ...previousEnv };
});

function mockFetch(responses: unknown[]) {
  const fetchMock = vi.fn();
  for (const body of responses) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status: 201 })
    );
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Lulu print API helpers", () => {
  it("pads quote page counts to Lulu's hardcover minimum", () => {
    expect(getLuluBillablePageCount(20)).toBe(24);
    expect(getLuluBillablePageCount(32)).toBe(32);
    expect(buildLuluQuotePayload({ pageCount: 20, shipping })).toMatchObject({
      line_items: [
        {
          page_count: 24,
          pod_package_id: "0850X0850.FC.PRE.CW.080CW444.MXX",
          quantity: 1,
        },
      ],
      shipping_option: "MAIL",
    });
  });

  it("uses OAuth credentials before requesting a quote", async () => {
    process.env.LULU_CLIENT_KEY = "client";
    process.env.LULU_CLIENT_SECRET = "secret";
    process.env.LULU_API_BASE_URL = "https://api.sandbox.lulu.com";
    const fetchMock = mockFetch([
      { access_token: "token", expires_in: 3600 },
      {
        currency: "AUD",
        total_cost_incl_tax: "33.65",
      },
    ]);

    await expect(
      quoteLuluPrintJob({ pageCount: 24, shipping })
    ).resolves.toMatchObject({
      currency: "AUD",
      total_cost_incl_tax: "33.65",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.sandbox.lulu.com/auth/realms/glasstree/protocol/openid-connect/token",
      expect.objectContaining({
        method: "POST",
        body: "grant_type=client_credentials",
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.sandbox.lulu.com/print-job-cost-calculations/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(
          buildLuluQuotePayload({ pageCount: 24, shipping })
        ),
      })
    );
  });

  it("reads the shipping amount from Lulu cost calculation responses", () => {
    expect(
      getLuluShippingAmountAud({
        currency: "AUD",
        shipping_cost: {
          total_cost_incl_tax: "15.15",
        },
      })
    ).toBe(15.15);
  });

  it("requests cover dimensions with the billable page count", async () => {
    process.env.LULU_BASIC_AUTH = "basic-token";
    process.env.LULU_API_BASE_URL = "https://api.sandbox.lulu.com";
    const fetchMock = mockFetch([
      { access_token: "token", expires_in: 3600 },
      { width: "1264.000", height: "648.000", unit: "pt" },
    ]);

    await expect(getLuluCoverDimensions({ pageCount: 20 })).resolves.toEqual({
      width: "1264.000",
      height: "648.000",
      unit: "pt",
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.sandbox.lulu.com/cover-dimensions/",
      expect.objectContaining({
        body: JSON.stringify({
          pod_package_id: "0850X0850.FC.PRE.CW.080CW444.MXX",
          interior_page_count: 24,
          unit: "pt",
        }),
      })
    );
  });

  it("derives the live paperback spine width from Lulu's total cover width", async () => {
    process.env.LULU_BASIC_AUTH = "basic-token";
    process.env.LULU_API_BASE_URL = "https://api.sandbox.lulu.com";
    // Verified live response shape for Perfect Bound @ 32pp.
    mockFetch([
      { access_token: "token", expires_in: 3600 },
      { width: "17.382", height: "8.750", unit: "inch" },
    ]);

    const spineWidthIn = await getLuluFlatCoverSpineWidthIn(32, "paperback");
    // 17.382 - 2 * 8.625 panel width = 0.132
    expect(spineWidthIn).toBeCloseTo(0.132, 3);
  });

  it("resolves coil spine width to exactly 0 (no continuous spine)", async () => {
    process.env.LULU_BASIC_AUTH = "basic-token";
    process.env.LULU_API_BASE_URL = "https://api.sandbox.lulu.com";
    // Verified live: coil total width is constant 17.25" at every page count.
    const fetchMock = mockFetch([
      { access_token: "token", expires_in: 3600 },
      { width: "17.250", height: "8.750", unit: "inch" },
    ]);

    const spineWidthIn = await getLuluFlatCoverSpineWidthIn(4, "coil");
    expect(spineWidthIn).toBe(0);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.sandbox.lulu.com/cover-dimensions/",
      expect.objectContaining({
        body: JSON.stringify({
          pod_package_id: "0850X0850.FC.STD.CO.060UW444.MXX",
          interior_page_count: 4,
          unit: "inch",
        }),
      })
    );
  });

  it("never returns a negative spine width even if Lulu's figure rounds under the panel estimate", async () => {
    process.env.LULU_BASIC_AUTH = "basic-token";
    process.env.LULU_API_BASE_URL = "https://api.sandbox.lulu.com";
    mockFetch([
      { access_token: "token", expires_in: 3600 },
      { width: "17.240", height: "8.750", unit: "inch" }, // slightly under 17.25
    ]);

    const spineWidthIn = await getLuluFlatCoverSpineWidthIn(24, "coil");
    expect(spineWidthIn).toBe(0);
  });
});

describe("getLuluCoverPdfUrlForProduct", () => {
  function baseProject(): Pick<BookProject, "assets"> {
    return {
      assets: {
        proofVersion: 1,
        luluCoverPdfUrl: "https://assets.test/hardcover-cover.pdf",
        luluFlatCoverPdfUrlByProduct: {
          paperback: "https://assets.test/paperback-cover.pdf",
        },
      },
    };
  }

  it("uses the eager hardcover field for hardcover", () => {
    expect(getLuluCoverPdfUrlForProduct(baseProject(), "hardcover")).toBe(
      "https://assets.test/hardcover-cover.pdf"
    );
  });

  it("uses the per-product map for paperback/coil", () => {
    expect(getLuluCoverPdfUrlForProduct(baseProject(), "paperback")).toBe(
      "https://assets.test/paperback-cover.pdf"
    );
    expect(
      getLuluCoverPdfUrlForProduct(baseProject(), "coil")
    ).toBeUndefined();
  });
});

describe("hasLuluPrintAssets (product-aware)", () => {
  function baseProject(): Pick<BookProject, "assets"> {
    return {
      assets: {
        proofVersion: 1,
        luluPrintPdfUrl: "https://assets.test/interior.pdf",
        luluPrintPdfPageCount: 40,
      },
    };
  }

  it("requires the hardcover cover PDF to exist for a hardcover order", () => {
    expect(hasLuluPrintAssets(baseProject(), "hardcover")).toBe(false);
    expect(
      hasLuluPrintAssets(
        {
          assets: {
            ...baseProject().assets,
            luluCoverPdfUrl: "https://assets.test/hardcover-cover.pdf",
          },
        },
        "hardcover"
      )
    ).toBe(true);
  });

  it("does NOT require the paperback cover to already exist (generated lazily at fulfillment)", () => {
    expect(hasLuluPrintAssets(baseProject(), "paperback")).toBe(true);
  });

  it("still requires the shared interior PDF to exist for paperback/coil", () => {
    expect(
      hasLuluPrintAssets(
        { assets: { proofVersion: 1 } },
        "paperback"
      )
    ).toBe(false);
  });

  it("still enforces the per-product minimum page count for paperback", () => {
    expect(
      hasLuluPrintAssets(
        {
          assets: {
            ...baseProject().assets,
            luluPrintPdfPageCount: 24, // below the 32pp Perfect Bound floor
          },
        },
        "paperback"
      )
    ).toBe(false);
  });
});
