import { describe, expect, it } from "vitest";
import {
  resolvePreferredFixtures,
  stampSpreadLocations,
} from "@/lib/print-books/locationBible";
import { applyFixtureToLocation } from "@/lib/print-books/locationFixtures";
import type { Story } from "@/types";
import type {
  BookSpread,
  LocationBible,
  LocationFixture,
  SceneLocation,
} from "@/types/printBook";

function sceneLocation(overrides: Partial<SceneLocation>): SceneLocation {
  return {
    id: "loc",
    name: "Place",
    place: "Place",
    summary: "",
    fixedElements: [],
    lighting: "",
    palette: "",
    doNotChange: [],
    ...overrides,
  };
}

function fixture(overrides: Partial<LocationFixture>): LocationFixture {
  return {
    id: "fixture",
    userId: "user-1",
    place: "Place",
    fixedElements: [],
    doNotChange: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolvePreferredFixtures — no wrong-room application (L2)", () => {
  it("does NOT apply a saved Lounge onto a Kitchen location", () => {
    const kitchen = sceneLocation({
      id: "kitchen",
      place: "Grandma's Country House",
      area: "Kitchen",
      name: "Grandma's Country House (Kitchen)",
    });
    const lounge = fixture({
      id: "fixture-lounge",
      place: "Grandma's Country House",
      area: "Lounge",
    });

    const result = resolvePreferredFixtures(
      { locations: [kitchen], pageLocations: { 1: "kitchen" } },
      [lounge]
    );

    expect(result.unresolvedFixtureIds).toEqual(["fixture-lounge"]);
    // Kitchen keeps its identity; the lounge is not applied.
    expect(result.bible.locations[0].area).toBe("Kitchen");
    expect(result.bible.locations[0].fixtureId).toBeUndefined();
  });

  it("binds an exact place/area match and records the fixture id", () => {
    const lounge = sceneLocation({
      id: "lounge",
      place: "Grandma's Country House",
      area: "Lounge",
      name: "Grandma's Country House (Lounge)",
    });
    const loungeFixture = fixture({
      id: "fixture-lounge",
      place: "Grandma's Country House",
      area: "Lounge",
      notes: "Green sofa under the window",
    });

    const result = resolvePreferredFixtures(
      { locations: [lounge], pageLocations: { 1: "lounge" } },
      [loungeFixture]
    );

    expect(result.unresolvedFixtureIds).toEqual([]);
    expect(result.bible.locations[0].fixtureId).toBe("fixture-lounge");
    expect(result.bible.locations[0].notes).toBe("Green sofa under the window");
  });

  it("re-applies to an already-bound location idempotently", () => {
    const lounge = sceneLocation({
      id: "lounge",
      place: "Different Name Now",
      area: "Lounge",
      fixtureId: "fixture-lounge",
    });
    const loungeFixture = fixture({
      id: "fixture-lounge",
      place: "Grandma's Country House",
      area: "Lounge",
    });

    const result = resolvePreferredFixtures(
      { locations: [lounge], pageLocations: { 1: "lounge" } },
      [loungeFixture]
    );

    expect(result.resolutions[0].status).toBe("bound");
    expect(result.bible.locations[0].place).toBe("Grandma's Country House");
  });
});

describe("applyFixtureToLocation — preserves book overrides (L3)", () => {
  it("does not overwrite parent notes/image when hasBookOverrides is set", () => {
    const corrected = sceneLocation({
      id: "kitchen",
      place: "Grandma's Country House",
      area: "Kitchen",
      notes: "Parent correction",
      establishingImageUrl: "https://acct.blob.vercel-storage.com/correct.jpg",
      hasBookOverrides: true,
    });
    const libraryFixture = fixture({
      id: "fixture-kitchen",
      place: "Grandma's Country House",
      area: "Kitchen",
      notes: "Library default",
      establishingImageUrl: "https://acct.blob.vercel-storage.com/library.jpg",
    });

    const next = applyFixtureToLocation(corrected, libraryFixture);
    expect(next.notes).toBe("Parent correction");
    expect(next.establishingImageUrl).toBe(
      "https://acct.blob.vercel-storage.com/correct.jpg"
    );
    expect(next.fixtureId).toBe("fixture-kitchen");
  });

  it("applies library defaults when there are no book overrides", () => {
    const bare = sceneLocation({
      id: "kitchen",
      place: "Grandma's Country House",
      area: "Kitchen",
    });
    const libraryFixture = fixture({
      id: "fixture-kitchen",
      place: "Grandma's Country House",
      area: "Kitchen",
      notes: "Library default",
    });
    const next = applyFixtureToLocation(bare, libraryFixture);
    expect(next.notes).toBe("Library default");
  });
});

describe("stampSpreadLocations — source-page provenance (L4)", () => {
  const story: Story = {
    id: "story-1",
    userId: "user-1",
    title: "Adventure",
    profileId: "p1",
    profileName: "Mia",
    wordCount: 10,
    theme: "kindness",
    notes: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    pages: [
      { pageNumber: 1, text: "Mia smiled and waved.", illustrationPrompt: "" },
      { pageNumber: 2, text: "Mia smiled and waved.", illustrationPrompt: "" },
    ],
  };
  const bible: LocationBible = {
    locations: [
      sceneLocation({ id: "bedroom", place: "Bedroom" }),
      sceneLocation({ id: "garden", place: "Garden" }),
    ],
    pageLocations: { 1: "bedroom", 2: "garden" },
  };

  it("uses provenance so identical page text still maps to the right place", () => {
    const spreads: BookSpread[] = [
      {
        id: "s2",
        bookProjectId: "b1",
        sequence: 2,
        pageStart: 4,
        pageEnd: 5,
        layoutType: "text_art",
        leftPageText: "Mia smiled and waved.",
        rightPageText: "",
        sceneBrief: "",
        illustrationPrompt: "",
        sourcePageNumbers: [2],
      },
    ];
    const [stamped] = stampSpreadLocations(spreads, story, bible);
    expect(stamped.locationId).toBe("garden");
  });

  it("falls back to token overlap when provenance is absent (legacy)", () => {
    const spreads: BookSpread[] = [
      {
        id: "s1",
        bookProjectId: "b1",
        sequence: 1,
        pageStart: 2,
        pageEnd: 3,
        layoutType: "text_art",
        leftPageText: "Mia smiled and waved.",
        rightPageText: "",
        sceneBrief: "",
        illustrationPrompt: "",
      },
    ];
    const [stamped] = stampSpreadLocations(spreads, story, bible);
    // First best-matching page wins on token overlap — page 1 (bedroom).
    expect(stamped.locationId).toBe("bedroom");
  });
});
