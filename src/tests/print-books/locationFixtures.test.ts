import { describe, expect, it } from "vitest";
import {
  applyFixtureToLocation,
  locationFixtureName,
  locationSimilarity,
  normalizeLocationKey,
  suggestFixtureMatches,
} from "@/lib/print-books/locationFixtures";
import type { LocationFixture, SceneLocation } from "@/types/printBook";

function makeFixture(
  partial: Partial<LocationFixture> & { id: string; place: string }
): LocationFixture {
  return {
    userId: "user-1",
    area: undefined,
    summary: undefined,
    notes: undefined,
    referenceImageUrl: undefined,
    fixedElements: [],
    doNotChange: [],
    lighting: undefined,
    palette: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function makeLocation(
  partial: Partial<SceneLocation> & { id: string; place: string }
): SceneLocation {
  return {
    name: partial.name ?? partial.place,
    area: undefined,
    summary: "",
    fixedElements: [],
    lighting: "",
    palette: "",
    doNotChange: [],
    ...partial,
  };
}

describe("normalizeLocationKey", () => {
  it("is punctuation- and case-insensitive and order-preserving", () => {
    expect(normalizeLocationKey("Grandma's House", "Lounge")).toBe(
      "grandmas house lounge"
    );
    expect(normalizeLocationKey("  THE CAR ")).toBe("the car");
  });
});

describe("locationSimilarity", () => {
  it("returns 1 for identical normalised labels", () => {
    expect(
      locationSimilarity(
        { place: "Grandma's House", area: "Lounge" },
        { place: "grandmas house", area: "lounge" }
      )
    ).toBe(1);
  });

  it("boosts when one label contains the other", () => {
    const score = locationSimilarity(
      { place: "Grandma's House" },
      { place: "Grandma's House", area: "Lounge" }
    );
    expect(score).toBeGreaterThanOrEqual(0.75);
  });

  it("is low for unrelated places", () => {
    expect(
      locationSimilarity({ place: "Playground" }, { place: "Kitchen" })
    ).toBeLessThan(0.6);
  });
});

describe("suggestFixtureMatches", () => {
  const fixtures = [
    makeFixture({ id: "f-house", place: "Grandma's House", area: "Lounge" }),
    makeFixture({ id: "f-car", place: "The Family Car" }),
  ];

  it("suggests the best-matching fixture above threshold", () => {
    const locations = [
      makeLocation({ id: "l1", place: "Grandma's House", area: "Lounge" }),
      makeLocation({ id: "l2", place: "Beach" }),
    ];
    const suggestions = suggestFixtureMatches(locations, fixtures);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].location.id).toBe("l1");
    expect(suggestions[0].fixture.id).toBe("f-house");
  });

  it("does not reuse a fixture for multiple locations", () => {
    const locations = [
      makeLocation({ id: "l1", place: "Grandma's House", area: "Lounge" }),
      makeLocation({ id: "l2", place: "Grandma's House", area: "Kitchen" }),
    ];
    const suggestions = suggestFixtureMatches(locations, fixtures);
    const fixtureIds = suggestions.map((s) => s.fixture.id);
    expect(new Set(fixtureIds).size).toBe(fixtureIds.length);
  });

  it("returns nothing when there is no confident match", () => {
    const locations = [makeLocation({ id: "l1", place: "Space Station" })];
    expect(suggestFixtureMatches(locations, fixtures)).toHaveLength(0);
  });
});

describe("applyFixtureToLocation", () => {
  it("copies fixture ground-truth while keeping the location id", () => {
    const location = makeLocation({
      id: "l1",
      place: "Grandma's House",
      area: "Lounge",
      summary: "AI-guessed lounge",
    });
    const fixture = makeFixture({
      id: "f-house",
      place: "Grandma's House",
      area: "Lounge",
      summary: "Real lounge with green sofa",
      notes: "Green velvet sofa under the bay window",
      referenceImageUrl: "https://example.com/lounge.jpg",
      fixedElements: ["green velvet sofa"],
    });
    const applied = applyFixtureToLocation(location, fixture);
    expect(applied.id).toBe("l1");
    expect(applied.name).toBe(locationFixtureName(fixture));
    expect(applied.notes).toBe("Green velvet sofa under the bay window");
    expect(applied.referenceImageUrl).toBe("https://example.com/lounge.jpg");
    expect(applied.summary).toBe("Real lounge with green sofa");
    expect(applied.fixedElements).toEqual(["green velvet sofa"]);
  });
});
