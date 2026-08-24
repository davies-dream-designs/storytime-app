import Anthropic from "@anthropic-ai/sdk";
import type { Story } from "@/types";
import type {
  BookSpread,
  LocationBible,
  SceneLocation,
} from "@/types/printBook";

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

function buildLocationBiblePrompt(story: Story): string {
  return `You are preparing a LOCATION BIBLE for a children's print-ready picture book.

The illustrator draws each page separately, so without a shared setting guide the background, furniture, props, and lighting drift between pages (a cot changes shape, a night-light disappears, a lamp jumps sides). Your job is to lock the setting so every page in the SAME place is drawn the same way, while still allowing the story to move between different places.

Story:
- Title: ${story.title}
- Theme: ${story.theme || "gentle bedtime adventure"}
- Premise: ${story.premise || "Not provided"}

Pages (in order):
${summarizeStoryPages(story)}

Do this:
1. Identify the DISTINCT physical places in the story. Merge places that are the same real location even if described with different words, and — this is important — if the story leaves a place and later returns to it (e.g. home → outside → home), that is ONE location reused, not two.
2. For each location, write a canonical, reusable description an illustrator can redraw identically on every page set there: the room/place itself, the fixed furniture and props and roughly where they sit relative to each other, wall/window features, floor, and a single consistent light source with the direction its shadows fall.
3. Assign EVERY page number to exactly one location id.

Return ONLY valid JSON with this exact shape:
{
  "locations": [
    {
      "id": "short_snake_case_id",
      "name": "human readable name",
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
- Prefer FEW locations; only split when the place genuinely changes.
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
        const name =
          typeof loc.name === "string" && loc.name.trim()
            ? loc.name.trim()
            : `Location ${index + 1}`;
        const id =
          typeof loc.id === "string" && loc.id.trim()
            ? slugify(loc.id)
            : slugify(name);
        return {
          id,
          name,
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

export async function generateLocationBible(input: {
  story: Story;
}): Promise<LocationBible> {
  const prompt = buildLocationBiblePrompt(input.story);

  const attempt = async (): Promise<LocationBible> => {
    const message = await getClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });
    const content = message.content[0];
    if (content.type !== "text")
      throw new Error("Unexpected response type from AI");
    return normalizeLocationBible(
      parseLocationBible(content.text.trim()),
      input.story
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
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "was",
  "were", "is", "are", "it", "its", "he", "she", "they", "them", "his", "her",
  "with", "for", "up", "down", "so", "not", "that", "this", "then", "there",
  "very", "little", "big", "one",
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
  if (location.fixedElements.length > 0) {
    const els = location.fixedElements.join("; ");
    parts.push(
      `Fixed elements and positions (do not add, remove, resize, or move them between pages): ${clampPreview(els, compact ? 260 : 600)}.`
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
    "Vary the camera angle and composition for visual interest, but the room, furniture, props, their positions, and the light source must stay the same as other pages in this location."
  );
  return parts.join(" ");
}
