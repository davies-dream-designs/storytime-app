import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLuluQuotePayload,
  getLuluBillablePageCount,
  getLuluCoverDimensions,
  quoteLuluPrintJob,
  resetLuluTokenCacheForTests,
} from "@/lib/print-books/lulu";
import type { PrintShippingAddress } from "@/types/printBook";

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
});
