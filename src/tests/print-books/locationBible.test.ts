import { describe, expect, it } from "vitest";
import {
  buildLocationDirection,
  resolveSpreadLocation,
  resolveSpreadLocationReference,
  stampSpreadLocations,
} from "@/lib/print-books/locationBible";
import type { Story } from "@/types";
import type { BookSpread, LocationBible, SceneLocation } from "@/types/printBook";

const bedroom: SceneLocation = {
  id: "bedroom",
  name: "Levi's bedroom",
  place: "House",
  area: "Nursery",
  summary: "A cosy nursery with a wooden cot beside the window.",
  fixedElements: [
    "wooden slatted cot to the right of the window",
    "wall night-light with switch above the cot",
  ],
  lighting: "warm night-light from the left, shadows fall to the right",
  palette: "soft blues and creams",
  doNotChange: ["cot shape", "night-light position"],
};

const garden: SceneLocation = {
  id: "garden",
  name: "Moonlit garden",
  place: "Garden",
  summary: "A garden path under a full moon.",
  fixedElements: ["silver gate at the end of the path"],
  lighting: "cool moonlight from above",
  palette: "silvers and deep greens",
  doNotChange: ["gate position"],
};

const bible: LocationBible = {
  locations: [bedroom, garden],
  pageLocations: { 1: "bedroom", 2: "garden", 3: "bedroom" },
};

function createSpread(overrides: Partial<BookSpread>): BookSpread {
  return {
    id: "spread-1",
    bookProjectId: "book-1",
    sequence: 3,
    pageStart: 3,
    pageEnd: 4,
    layoutType: "hero",
    leftPageText: "",
    rightPageText: "",
    sceneBrief: "",
    illustrationPrompt: "",
    ...overrides,
  };
}

function createStory(): Story {
  return {
    id: "story-1",
    userId: "user-1",
    title: "Levi's Bedtime",
    profileId: "profile-1",
    profileName: "Levi",
    wordCount: 60,
    theme: "bedtime",
    notes: "",
    createdAt: "2026-07-15T00:00:00.000Z",
    pages: [
      {
        pageNumber: 1,
        text: "Levi snuggled into his cot beside the window as the nightlight glowed.",
        illustrationPrompt: "Levi in his cot",
      },
      {
        pageNumber: 2,
        text: "He dreamed of a moonlit garden with a shimmering silver gate.",
        illustrationPrompt: "A silver garden gate",
      },
      {
        pageNumber: 3,
        text: "Then Levi returned to his cot beside the window and closed his eyes.",
        illustrationPrompt: "Levi back in his cot",
      },
    ],
  };
}

describe("resolveSpreadLocation", () => {
  it("returns the location matching the stamped locationId", () => {
    const spread = createSpread({ locationId: "garden" });
    expect(resolveSpreadLocation(bible, spread)?.id).toBe("garden");
  });

  it("returns undefined when no bible is present", () => {
    expect(
      resolveSpreadLocation(undefined, createSpread({ locationId: "garden" }))
    ).toBeUndefined();
  });

  it("returns undefined when the spread is unstamped", () => {
    expect(resolveSpreadLocation(bible, createSpread({}))).toBeUndefined();
  });

  it("returns undefined for an unknown locationId", () => {
    expect(
      resolveSpreadLocation(bible, createSpread({ locationId: "attic" }))
    ).toBeUndefined();
  });
});

describe("buildLocationDirection", () => {
  it("returns an empty string when no location is provided", () => {
    expect(buildLocationDirection(undefined)).toBe("");
  });

  it("includes the fixed elements and lighting", () => {
    const text = buildLocationDirection(bedroom);
    expect(text).toContain("Levi's bedroom");
    expect(text).toContain("wooden slatted cot");
    expect(text).toContain("night-light");
    expect(text).toContain("shadows fall to the right");
  });

  it("compact variant is shorter than the full variant", () => {
    const full = buildLocationDirection(bedroom);
    const compact = buildLocationDirection(bedroom, { compact: true });
    expect(compact.length).toBeLessThan(full.length);
    expect(compact).toContain("Levi's bedroom");
  });

  it("locks fixed-object orientation and reframes the camera without turning the room", () => {
    const text = buildLocationDirection(bedroom);
    expect(text).toContain("do not rotate, mirror, or flip");
    expect(text).toContain("reposition the camera, not the room");
    expect(text).not.toContain("Vary the camera angle");
  });

  it("omits the orientation lock when there are no fixed elements", () => {
    const noFixed: SceneLocation = { ...bedroom, fixedElements: [] };
    expect(buildLocationDirection(noFixed)).not.toContain(
      "do not rotate, mirror, or flip"
    );
  });
});

describe("stampSpreadLocations", () => {
  it("returns spreads unchanged when there is no bible", () => {
    const spreads = [createSpread({ leftPageText: "hello" })];
    expect(stampSpreadLocations(spreads, createStory(), undefined)).toBe(
      spreads
    );
  });

  it("stamps each spread with the location of the story page it matches", () => {
    const story = createStory();
    const spreads: BookSpread[] = [
      createSpread({
        id: "s1",
        leftPageText: "Levi snuggled into his cot beside the window",
        rightPageText: "as the nightlight glowed",
      }),
      createSpread({
        id: "s2",
        leftPageText: "He dreamed of a moonlit garden",
        rightPageText: "with a shimmering silver gate",
      }),
    ];
    const stamped = stampSpreadLocations(spreads, story, bible);
    expect(stamped[0].locationId).toBe("bedroom");
    expect(stamped[1].locationId).toBe("garden");
  });

  it("maps a page that revisits an earlier place back to the same location", () => {
    const story = createStory();
    const spread = createSpread({
      id: "s3",
      leftPageText: "Then Levi returned to his cot beside the window",
      rightPageText: "and closed his eyes",
    });
    const [stamped] = stampSpreadLocations([spread], story, bible);
    expect(stamped.locationId).toBe("bedroom");
  });

  it("leaves front/end matter with no story text overlap unstamped", () => {
    const story = createStory();
    const spread = createSpread({
      id: "dedication",
      leftPageText: "For everyone who dreams",
      rightPageText: "The End",
    });
    const [stamped] = stampSpreadLocations([spread], story, bible);
    expect(stamped.locationId).toBeUndefined();
  });
});

describe("parent-supplied location details", () => {
  it("injects parent notes as authoritative ground-truth", () => {
    const withNotes: SceneLocation = {
      ...bedroom,
      notes: "The cot is white metal, not wooden, and sits under the window.",
    };
    const direction = buildLocationDirection(withNotes);
    expect(direction).toContain("Ground-truth from the family");
    expect(direction).toContain("white metal");
  });

  it("adds no notes clause when the parent left notes empty", () => {
    const direction = buildLocationDirection(bedroom);
    expect(direction).not.toContain("Ground-truth from the family");
  });

  it("resolves the establishing illustration for a stamped spread", () => {
    const drawnBible: LocationBible = {
      locations: [
        {
          ...bedroom,
          establishingImageUrl: "https://cdn.example/bedroom-establishing.png",
        },
        garden,
      ],
      pageLocations: bible.pageLocations,
    };
    const ref = resolveSpreadLocationReference(drawnBible, {
      locationId: "bedroom",
    });
    expect(ref).toEqual({
      id: "location:bedroom",
      label:
        "Established view of Levi's bedroom — keep this room, furniture, and object orientation identical",
      imageUrl: "https://cdn.example/bedroom-establishing.png",
    });
  });

  it("returns no reference photo when the location has none", () => {
    expect(
      resolveSpreadLocationReference(bible, { locationId: "bedroom" })
    ).toBeUndefined();
  });

  it("uses a legacy raw photo only when no establishing illustration exists", () => {
    const legacyBible: LocationBible = {
      locations: [
        { ...bedroom, referenceImageUrl: "https://cdn.example/nursery.jpg" },
        garden,
      ],
      pageLocations: bible.pageLocations,
    };
    const ref = resolveSpreadLocationReference(legacyBible, {
      locationId: "bedroom",
    });
    expect(ref?.imageUrl).toBe("https://cdn.example/nursery.jpg");
    expect(ref?.label).toContain("Established view");
  });

  it("prefers the establishing illustration over a legacy raw photo", () => {
    const bothBible: LocationBible = {
      locations: [
        {
          ...bedroom,
          referenceImageUrl: "https://cdn.example/nursery.jpg",
          establishingImageUrl: "https://cdn.example/bedroom-establishing.png",
        },
        garden,
      ],
      pageLocations: bible.pageLocations,
    };
    const ref = resolveSpreadLocationReference(bothBible, {
      locationId: "bedroom",
    });
    expect(ref?.imageUrl).toBe(
      "https://cdn.example/bedroom-establishing.png"
    );
  });

  it("describes an attached establishing rendering in the direction text", () => {
    const withEstablishing: SceneLocation = {
      ...bedroom,
      establishingImageUrl: "https://cdn.example/bedroom-establishing.png",
    };
    const direction = buildLocationDirection(withEstablishing);
    expect(direction).toContain("established rendering");
    expect(direction).toContain("orientation");
  });
});
