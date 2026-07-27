import { NextRequest, NextResponse } from "next/server";

type PlacesAutocompletePrediction = {
  description?: unknown;
  place_id?: unknown;
  structured_formatting?: {
    main_text?: unknown;
    secondary_text?: unknown;
  };
};

type PlacesAutocompleteResponse = {
  predictions?: PlacesAutocompletePrediction[];
  status?: string;
  error_message?: string;
};

function cleanInput(value: string | null) {
  return (value ?? "").trim().slice(0, 160);
}

export async function GET(req: NextRequest) {
  const input = cleanInput(req.nextUrl.searchParams.get("input"));
  if (input.length < 3) {
    return NextResponse.json({ suggestions: [] });
  }

  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return NextResponse.json(
      { error: "Address autocomplete is not configured." },
      { status: 503 }
    );
  }

  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/autocomplete/json"
  );
  url.searchParams.set("input", input);
  url.searchParams.set("key", process.env.GOOGLE_PLACES_API_KEY);
  url.searchParams.set("components", "country:au");
  url.searchParams.set("types", "address");

  const response = await fetch(url, { cache: "no-store" });
  const body = (await response.json()) as PlacesAutocompleteResponse;

  if (
    !response.ok ||
    (body.status && body.status !== "OK" && body.status !== "ZERO_RESULTS")
  ) {
    return NextResponse.json(
      { error: body.error_message ?? "Address autocomplete failed." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    suggestions: (body.predictions ?? []).slice(0, 5).map((prediction) => ({
      placeId:
        typeof prediction.place_id === "string" ? prediction.place_id : "",
      description:
        typeof prediction.description === "string"
          ? prediction.description
          : "",
      mainText:
        typeof prediction.structured_formatting?.main_text === "string"
          ? prediction.structured_formatting.main_text
          : undefined,
      secondaryText:
        typeof prediction.structured_formatting?.secondary_text === "string"
          ? prediction.structured_formatting.secondary_text
          : undefined,
    })),
  });
}
