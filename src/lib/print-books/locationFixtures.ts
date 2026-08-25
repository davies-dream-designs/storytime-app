import type { LocationFixture, SceneLocation } from "@/types/printBook";
import { composeLocationName } from "./locationNames";

export function locationFixtureName(fixture: LocationFixture): string {
  return composeLocationName(fixture.place, fixture.area);
}

/** Normalise a place/area label for order-insensitive, punctuation-free comparison. */
export function normalizeLocationKey(place: string, area?: string): string {
  return [place, area]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(value.split(" ").filter((t) => t.length > 2));
}

/**
 * Deterministic string/heuristic similarity in [0,1] between two location
 * labels. 1 = identical normalised key; otherwise Jaccard token overlap with a
 * boost when one label fully contains the other (e.g. "Grandma's House" vs
 * "Grandma's House (Lounge)").
 */
export function locationSimilarity(
  a: { place: string; area?: string },
  b: { place: string; area?: string }
): number {
  const keyA = normalizeLocationKey(a.place, a.area);
  const keyB = normalizeLocationKey(b.place, b.area);
  if (!keyA || !keyB) return 0;
  if (keyA === keyB) return 1;

  const ta = tokens(keyA);
  const tb = tokens(keyB);
  if (ta.size === 0 || tb.size === 0) return 0;

  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  const union = new Set([...ta, ...tb]).size;
  const jaccard = shared / union;

  const contains = keyA.includes(keyB) || keyB.includes(keyA);
  return contains ? Math.max(jaccard, 0.75) : jaccard;
}

export interface FixtureSuggestion {
  location: SceneLocation;
  fixture: LocationFixture;
  score: number;
}

/**
 * Suggest-and-confirm dedup: for each story location, return the best-matching
 * saved fixture above `threshold`, if any. Never auto-applies — callers surface
 * these for the parent to confirm. A fixture is suggested for at most one
 * location (its strongest match) to avoid duplicate confirmations.
 */
export function suggestFixtureMatches(
  locations: SceneLocation[],
  fixtures: LocationFixture[],
  threshold = 0.6
): FixtureSuggestion[] {
  const suggestions: FixtureSuggestion[] = [];
  const usedFixtureIds = new Set<string>();

  for (const location of locations) {
    let best: FixtureSuggestion | undefined;
    for (const fixture of fixtures) {
      if (usedFixtureIds.has(fixture.id)) continue;
      const score = locationSimilarity(location, fixture);
      if (score >= threshold && (!best || score > best.score)) {
        best = { location, fixture, score };
      }
    }
    if (best) {
      suggestions.push(best);
      usedFixtureIds.add(best.fixture.id);
    }
  }

  return suggestions;
}

/** Copy a saved fixture's ground-truth onto a story location (keeps location id/page mapping). */
export function applyFixtureToLocation(
  location: SceneLocation,
  fixture: LocationFixture
): SceneLocation {
  return {
    ...location,
    place: fixture.place || location.place,
    area: fixture.area ?? location.area,
    name: locationFixtureName(fixture),
    summary: fixture.summary || location.summary,
    notes: fixture.notes ?? location.notes,
    referenceImageUrl: fixture.referenceImageUrl ?? location.referenceImageUrl,
    establishingImageUrl:
      fixture.establishingImageUrl ?? location.establishingImageUrl,
    fixedElements: fixture.fixedElements.length
      ? fixture.fixedElements
      : location.fixedElements,
    doNotChange: fixture.doNotChange.length
      ? fixture.doNotChange
      : location.doNotChange,
    lighting: fixture.lighting || location.lighting,
    palette: fixture.palette || location.palette,
  };
}
