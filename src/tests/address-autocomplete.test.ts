import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const previousEnv = process.env;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.env = { ...previousEnv };
});

describe("address autocomplete API", () => {
  it("returns AU address suggestions without exposing the Google payload shape", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "places-key";
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        status: "OK",
        predictions: [
          {
            place_id: "place-1",
            description: "1 Story Street, Sydney NSW, Australia",
            structured_formatting: {
              main_text: "1 Story Street",
              secondary_text: "Sydney NSW, Australia",
            },
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/address/autocomplete/route");
    const res = await GET(
      new NextRequest(
        "http://localhost/api/address/autocomplete?input=1%20Story"
      )
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      suggestions: [
        {
          placeId: "place-1",
          description: "1 Story Street, Sydney NSW, Australia",
          mainText: "1 Story Street",
          secondaryText: "Sydney NSW, Australia",
        },
      ],
    });
    const fetchCalls = (
      fetchMock as unknown as { mock: { calls: Array<[string]> } }
    ).mock.calls;
    const requestedUrl = new URL(fetchCalls[0]?.[0] ?? "");
    expect(requestedUrl.searchParams.get("components")).toBe("country:au");
    expect(requestedUrl.searchParams.get("types")).toBe("address");
  });

  it("returns no suggestions before the user has typed enough", async () => {
    const { GET } = await import("@/app/api/address/autocomplete/route");
    const res = await GET(
      new NextRequest("http://localhost/api/address/autocomplete?input=ab")
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ suggestions: [] });
  });

  it("uses customer-safe copy when suggestions are unavailable", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    const { GET } = await import("@/app/api/address/autocomplete/route");
    const res = await GET(
      new NextRequest(
        "http://localhost/api/address/autocomplete?input=1%20Story"
      )
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: "Address suggestions are unavailable right now.",
    });
  });
});

describe("address details API", () => {
  it("maps Google address components into a print shipping address", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "places-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          status: "OK",
          result: {
            address_components: [
              { long_name: "1", short_name: "1", types: ["street_number"] },
              {
                long_name: "Story Street",
                short_name: "Story St",
                types: ["route"],
              },
              {
                long_name: "Sydney",
                short_name: "Sydney",
                types: ["locality"],
              },
              {
                long_name: "New South Wales",
                short_name: "NSW",
                types: ["administrative_area_level_1"],
              },
              { long_name: "2000", short_name: "2000", types: ["postal_code"] },
              { long_name: "Australia", short_name: "AU", types: ["country"] },
            ],
          },
        }),
      }))
    );

    const { GET } = await import("@/app/api/address/details/route");
    const res = await GET(
      new NextRequest("http://localhost/api/address/details?placeId=place-1")
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      address: {
        line1: "1 Story Street",
        city: "Sydney",
        state: "NSW",
        postalCode: "2000",
        countryCode: "AU",
      },
    });
  });

  it("rejects incomplete or non-AU address details", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "places-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          status: "OK",
          result: {
            address_components: [
              {
                long_name: "London",
                short_name: "London",
                types: ["locality"],
              },
              {
                long_name: "United Kingdom",
                short_name: "GB",
                types: ["country"],
              },
            ],
          },
        }),
      }))
    );

    const { GET } = await import("@/app/api/address/details/route");
    const res = await GET(
      new NextRequest("http://localhost/api/address/details?placeId=place-1")
    );

    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({
      error: "Please choose a complete Australian street address.",
    });
  });
});
