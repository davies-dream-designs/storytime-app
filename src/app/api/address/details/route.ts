import { NextRequest, NextResponse } from "next/server";
import type { PrintShippingAddress } from "@/types/printBook";

type AddressComponent = {
  long_name?: unknown;
  short_name?: unknown;
  types?: unknown;
};

type PlaceDetailsResponse = {
  result?: {
    address_components?: AddressComponent[];
    formatted_address?: unknown;
  };
  status?: string;
  error_message?: string;
};

function getComponent(
  components: AddressComponent[],
  type: string,
  key: "long_name" | "short_name" = "long_name"
) {
  const component = components.find(
    (item) => Array.isArray(item.types) && item.types.includes(type)
  );
  const value = component?.[key];
  return typeof value === "string" ? value : "";
}

export async function GET(req: NextRequest) {
  const placeId = (req.nextUrl.searchParams.get("placeId") ?? "")
    .trim()
    .slice(0, 180);
  if (!placeId) {
    return NextResponse.json(
      { error: "Place ID is required." },
      { status: 400 }
    );
  }

  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return NextResponse.json(
      { error: "Address suggestions are unavailable right now." },
      { status: 503 }
    );
  }

  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/details/json"
  );
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("key", process.env.GOOGLE_PLACES_API_KEY);
  url.searchParams.set("fields", "address_components,formatted_address");

  const response = await fetch(url, { cache: "no-store" });
  const body = (await response.json()) as PlaceDetailsResponse;

  if (!response.ok || body.status !== "OK") {
    return NextResponse.json(
      { error: "Address lookup is unavailable right now." },
      { status: 502 }
    );
  }

  const components = body.result?.address_components ?? [];
  const streetNumber = getComponent(components, "street_number");
  const route = getComponent(components, "route");
  const line1 = [streetNumber, route].filter(Boolean).join(" ").trim();
  const city =
    getComponent(components, "locality") ||
    getComponent(components, "postal_town") ||
    getComponent(components, "administrative_area_level_2");
  const state = getComponent(
    components,
    "administrative_area_level_1",
    "short_name"
  );
  const postalCode = getComponent(components, "postal_code");
  const countryCode = getComponent(components, "country", "short_name");

  if (!line1 || !city || !postalCode || countryCode !== "AU") {
    return NextResponse.json(
      { error: "Please choose a complete Australian street address." },
      { status: 422 }
    );
  }

  const address: Pick<
    PrintShippingAddress,
    "line1" | "city" | "state" | "postalCode" | "countryCode"
  > = {
    line1,
    city,
    state: state || undefined,
    postalCode,
    countryCode: "AU",
  };

  return NextResponse.json({ address });
}
