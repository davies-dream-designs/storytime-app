import Anthropic from "@anthropic-ai/sdk";
import type { Story } from "@/types";
import type {
  BookSpread,
  LocationBible,
  LocationFixture,
  LocationVisualReference,
  SceneLocation,
} from "@/types/printBook";
import { composeLocationName } from "./locationNames";
import {
  applyFixtureToLocation,
  locationFixtureName,
  locationSimilarity,
} from "./locationFixtures";

let client: Anthropic | undefined;

function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

function clampPreview(value: string, maxChars: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 1).trimEnd()}…`;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "location";
}

function summarizeStoryPages(story: Story): string {
  return story.pages
    .map((page) => {
      const text = clampPreview(page.text.trim(), 200);
      const visual = clampPreview(
        (page.illustrationPrompt ?? "").trim() || "None provided",
        160
      );
      return `- Page ${page.pageNumber}: text="${text}" visual="${visual}"`;
    })
    .join("\n");
}

function buildPreferredFixtureSection(
  fixtures: LocationFixture[] = []
): string {
  if (fixtures.length === 0) return "";

  return `\n\nParent-selected saved places to respect if the story visits them:
${fixtures
  .map(
    (fixture, index) => `
${index + 1}. ${locationFixtureName(fixture)}
- Summary: ${fixture.summary || "Not provided"}
- Notes: ${fixture.notes || "Not provided"}
- Fixed elements: ${fixture.fixedElements.join(", ") || "None provided"}
- Lighting: ${fixture.lighting || "Not provided"}
- Do not change: ${fixture.doNotChange.join(", ") || "None provided"}`
  )
  .join("\n")}

If the story clearly visits any saved place above, reuse its exact place/area naming and keep those family-supplied details authoritative. Different rooms/areas from the saved list should remain distinct locations.`;
}

function buildLocationBiblePrompt(
  story: Story,
  preferredFixtures: LocationFixture[] = []
): string {
  return `You are preparing a LOCATION BIBLE for a children's print-ready picture book.

The illustrator draws each page separately, so without a shared setting guide the background, furniture, props, and lighting drift between pages (a cot changes shape, a night-light disappears, a lamp jumps sides). Your job is to lock the setting so every page in the SAME place is drawn the same way, while still allowing the story to move between different places.

Story:
- Title: ${story.title}
- Theme: ${story.theme || "gentle bedtime adventure"}
- Premise: ${story.premise || "Not provided"}${buildPreferredFixtureSection(preferredFixtures)}

Pages (in order):
${summarizeStoryPages(story)}

Do this:
1. Identify the DISTINCT physical places in the story. Merge places that are the same real location even if described with different words, and — this is important — if the story leaves a place and later returns to it (e.g. home → outside → home), that is ONE location reused, not two.
2. Name each location SPECIFICALLY as a broad place plus, where it matters, the sub-area inside it. Use "place" for the broad location (e.g. "House", "Grandma's House", "Playground", "Car", "Market") and "area" for the specific room/spot inside it (e.g. "Nursery", "Kitchen", "Lounge"). Different rooms of the same building are DIFFERENT locations (House (Nursery) vs House (Kitchen)); leave "area" empty for places with no meaningful sub-area (e.g. Playground, Car).
3. For each location, write a canonical, reusable description an illustrator can redraw identically on every page set there: the room/place itself, the fixed furniture and props and roughly where they sit relative to each other, wall/window features, floor, and a single consistent light source with the direction its shadows fall.
4. Assign EVERY page number to exactly one location id.

Return ONLY valid JSON with this exact shape:
{
  "locations": [
    {
      "id": "short_snake_case_id",
      "place": "broad place, e.g. Grandma's House",
      "area": "sub-area inside it, e.g. Lounge (empty string if none)",
      "summary": "canonical description of the place",
      "fixedElements": ["specific furniture/prop and its rough position"],
      "lighting": "the one light source and the direction shadows fall",
      "palette": "colours for this place",
      "doNotChange": ["the highest-value things to keep identical across pages here"]
    }
  ],
  "pageLocations": { "1": "location_id", "2": "location_id" }
}

Requirements:
- Prefer FEW locations; only split when the place genuinely changes (a different building, or a different room/area within one).
- Reuse the same id whenever the story returns to a place already described.
- fixedElements must be concrete (e.g. "wooden slatted cot to the right of the window", "wall night-light with switch above the cot"), not vague.
- lighting must name a direction so shadows do not flip sides between pages.
- Every page number from the list above must appear in pageLocations, mapped to an id that exists in locations.
- Keep each field concise but specific.`;
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function parseLocationBible(raw: string): LocationBible {
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found in location bible reply");
    parsed = JSON.parse(match[0]);
  }
  const obj = parsed as {
    locations?: unknown;
    pageLocations?: unknown;
  };

  const locations: SceneLocation[] = Array.isArray(obj.locations)
    ? (obj.locations as Record<string, unknown>[]).map((loc, index) => {
        const place =
          typeof loc.place === "string" && loc.place.trim()
            ? loc.place.trim()
            : typeof loc.name === "string" && loc.name.trim()
              ? loc.name.trim()
              : `Location ${index + 1}`;
        const area =
          typeof loc.area === "string" && loc.area.trim()
            ? loc.area.trim()
            : undefined;
        const name = composeLocationName(place, area);
        const id =
          typeof loc.id === "string" && loc.id.trim()
            ? slugify(loc.id)
            : slugify(name);
        return {
          id,
          name,
          place,
          area,
          summary: typeof loc.summary === "string" ? loc.summary.trim() : "",
          fixedElements: coerceStringArray(loc.fixedElements),
          lighting: typeof loc.lighting === "string" ? loc.lighting.trim() : "",
          palette: typeof loc.palette === "string" ? loc.palette.trim() : "",
          doNotChange: coerceStringArray(loc.doNotChange),
        };
      })
    : [];

  const pageLocations: Record<number, string> = {};
  if (obj.pageLocations && typeof obj.pageLocations === "object") {
    for (const [key, value] of Object.entries(
      obj.pageLocations as Record<string, unknown>
    )) {
      const pageNumber = Number(key);
      if (Number.isFinite(pageNumber) && typeof value === "string") {
        pageLocations[pageNumber] = slugify(value);
      }
    }
  }

  return { locations, pageLocations };
}

/**
 * Guarantee the bible is internally consistent before we persist it: dedupe
 * location ids, ensure at least one location exists, and map every story page
 * to a valid location id (falling back to the first location).
 */
function normalizeLocationBible(
  bible: LocationBible,
  story: Story
): LocationBible {
  const seen = new Map<string, SceneLocation>();
  for (const loc of bible.locations) {
    let id = loc.id;
    let suffix = 2;
    while (seen.has(id) && seen.get(id)!.name !== loc.name) {
      id = `${loc.id}_${suffix}`;
      suffix += 1;
    }
    if (!seen.has(id)) seen.set(id, { ...loc, id });
  }

  let locations = [...seen.values()];
  if (locations.length === 0) {
    locations = [
      {
        id: "main_setting",
        name: "Main setting",
        place: "Main setting",
        summary: story.premise || story.title,
        fixedElements: [],
        lighting: "",
        palette: "",
        doNotChange: [],
      },
    ];
  }

  const validIds = new Set(locations.map((loc) => loc.id));
  const fallbackId = locations[0]!.id;
  const pageLocations: Record<number, string> = {};
  for (const page of story.pages) {
    const assigned = bible.pageLocations[page.pageNumber];
    pageLocations[page.pageNumber] =
      assigned && validIds.has(assigned) ? assigned : fallbackId;
  }

  return { locations, pageLocations };
}

export function applyPreferredFixturesToLocationBible(
  bible: LocationBible,
  preferredFixtures: LocationFixture[] = []
): LocationBible {
  if (preferredFixtures.length === 0) return bible;

  let locations = bible.locations;
  const usedLocationIds = new Set<string>();
  let changed = false;

  for (const fixture of preferredFixtures) {
    let bestLocation: SceneLocation | undefined;
    let bestScore = 0;
    for (const location of locations) {
      if (usedLocationIds.has(location.id)) continue;
      const score = locationSimilarity(location, fixture);
      if (score > bestScore) {
        bestScore = score;
        bestLocation = location;
      }
    }

    if (!bestLocation || bestScore < 0.6) continue;

    usedLocationIds.add(bestLocation.id);
    changed = true;
    locations = locations.map((location) =>
      location.id === bestLocation.id
        ? applyFixtureToLocation(location, fixture)
        : location
    );
  }

  return changed ? { ...bible, locations } : bible;
}

export function applyPreferredFixtureToLocationBible(
  bible: LocationBible,
  preferredFixture?: LocationFixture
): LocationBible {
  return applyPreferredFixturesToLocationBible(
    bible,
    preferredFixture ? [preferredFixture] : []
  );
}

export async function generateLocationBible(input: {
  story: Story;
  preferredFixture?: LocationFixture;
  preferredFixtures?: LocationFixture[];
}): Promise<LocationBible> {
  const preferredFixtures = [
    ...(input.preferredFixture ? [input.preferredFixture] : []),
    ...(input.preferredFixtures ?? []),
  ].filter(
    (fixture, index, fixtures) =>
      fixtures.findIndex((candidate) => candidate.id === fixture.id) === index
  );
  const prompt = buildLocationBiblePrompt(input.story, preferredFixtures);

  const attempt = async (): Promise<LocationBible> => {
    const message = await getClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });
    const content = message.content[0];
    if (content.type !== "text")
      throw new Error("Unexpected response type from AI");
    return applyPreferredFixturesToLocationBible(
      normalizeLocationBible(
        parseLocationBible(content.text.trim()),
        input.story
      ),
      preferredFixtures
    );
  };

  try {
    return await attempt();
  } catch (err) {
    console.warn(
      `Location bible parse failed (${
        err instanceof Error ? err.message : "unknown error"
      }) - retrying once.`
    );
    return attempt();
  }
}

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "of",
  "to",
  "in",
  "on",
  "at",
  "was",
  "were",
  "is",
  "are",
  "it",
  "its",
  "he",
  "she",
  "they",
  "them",
  "his",
  "her",
  "with",
  "for",
  "up",
  "down",
  "so",
  "not",
  "that",
  "this",
  "then",
  "there",
  "very",
  "little",
  "big",
  "one",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
  );
}

/**
 * Assign each spread a `locationId` by matching its page text to the story page
 * it was derived from (via token overlap), then reading that page's location.
 * Robust to book-vs-story page renumbering and to grouped/expanded spreads.
 * Spreads that don't clearly match a story page (title, dedication, "the end")
 * are left unstamped, so no setting block is injected for them.
 */
export function stampSpreadLocations(
  spreads: BookSpread[],
  story: Story,
  bible: LocationBible | undefined
): BookSpread[] {
  if (!bible) return spreads;
  const pageTokens = story.pages.map((page) => ({
    pageNumber: page.pageNumber,
    tokens: tokenize(page.text),
  }));

  return spreads.map((spread) => {
    const spreadTokens = tokenize(
      `${spread.leftPageText} ${spread.rightPageText}`
    );
    if (spreadTokens.size === 0) return spread;

    let bestPage: number | undefined;
    let bestScore = 0;
    for (const page of pageTokens) {
      let shared = 0;
      for (const token of spreadTokens) {
        if (page.tokens.has(token)) shared += 1;
      }
      if (shared > bestScore) {
        bestScore = shared;
        bestPage = page.pageNumber;
      }
    }

    if (bestPage === undefined || bestScore < 2) return spread;
    const locationId = bible.pageLocations[bestPage];
    if (!locationId) return spread;
    return { ...spread, locationId };
  });
}

function findLocationById(
  bible: LocationBible,
  locationId: string | undefined
): SceneLocation | undefined {
  if (!locationId) return undefined;
  return bible.locations.find((loc) => loc.id === locationId);
}

/**
 * Resolve which location a spread belongs to, using the explicit `locationId`
 * stamped at compose time. (Book page numbers are not the same as story page
 * numbers, so we deliberately do not fall back to a page-range lookup, which
 * could mis-map a spread to the wrong location.)
 */
export function resolveSpreadLocation(
  bible: LocationBible | undefined,
  spread: Pick<BookSpread, "locationId">
): SceneLocation | undefined {
  if (!bible) return undefined;
  return findLocationById(bible, spread.locationId);
}

/**
 * The setting block injected into a page image prompt. Kept compact so it never
 * crowds out the character-identity instructions in the prompt budget.
 */
export function buildLocationDirection(
  location: SceneLocation | undefined,
  options?: { compact?: boolean }
): string {
  if (!location) return "";
  const compact = options?.compact ?? false;
  const parts: string[] = [];
  const summary = clampPreview(location.summary, compact ? 220 : 480);
  parts.push(
    `Setting (keep this location identical on every page set here — "${location.name}"): ${summary}`
  );
  const notes = location.notes?.trim();
  if (notes) {
    parts.push(
      `Ground-truth from the family about this real place (authoritative — follow it over any conflicting detail above): ${clampPreview(notes, compact ? 220 : 400)}.`
    );
  }
  if (location.establishingImageUrl || location.referenceImageUrl) {
    parts.push(
      `An established rendering of this place is attached and authoritative; match its exact room layout, doors, windows, bed types, furniture positions, colours, and the orientation each object faces. Do not invent, remove, resize, or relocate structural features or furniture shown in the reference.`
    );
  }
  if (location.fixedElements.length > 0) {
    const els = location.fixedElements.join("; ");
    parts.push(
      `Fixed elements and positions (do not add, remove, resize, or move them between pages): ${clampPreview(els, compact ? 260 : 600)}.`
    );
    parts.push(
      "Keep each fixed object's orientation and the direction it faces identical to earlier pages in this location — do not rotate, mirror, or flip furniture and props (e.g. a cot must face the same way every time)."
    );
  }
  if (location.lighting) {
    parts.push(
      `Lighting and shadows (keep consistent): ${clampPreview(location.lighting, compact ? 140 : 260)}.`
    );
  }
  if (!compact && location.doNotChange.length > 0) {
    parts.push(
      `Do not change here: ${clampPreview(location.doNotChange.join("; "), 260)}.`
    );
  }
  parts.push(
    "You may frame the shot from a different distance or height for visual interest, but keep the same viewing direction into the room as other pages here: the room, furniture, props, their positions and the way each one faces, and the light source must stay consistent — reposition the camera, not the room."
  );
  return parts.join(" ");
}

/**
 * If the spread's resolved location has a parent-supplied reference photo,
 * return it as a conditioning reference so it can be tiled into the
 * illustration reference sheet.
 */
export function resolveSpreadLocationReference(
  bible: LocationBible | undefined,
  spread: Pick<BookSpread, "locationId">
): LocationVisualReference | undefined {
  const location = resolveSpreadLocation(bible, spread);
  if (!location) return undefined;
  // The establishing illustration is the canonical anchor for a location.
  // `referenceImageUrl` is only a legacy fallback for any raw photo saved before
  // locations switched to the drawn-establishing model.
  const imageUrl = location.establishingImageUrl ?? location.referenceImageUrl;
  if (!imageUrl) return undefined;
  return {
    id: `location:${location.id}`,
    label: `Established view of ${location.name} — keep this room, furniture, and object orientation identical`,
    imageUrl,
  };
}
