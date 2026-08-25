import { db } from "@/lib/db";
import { locationFixtureName } from "@/lib/print-books/locationFixtures";
import type { Story } from "@/types";
import type { LocationFixture } from "@/types/printBook";

export const MAX_STORY_LOCATION_FIXTURES = 5;

function sanitizeLocationFixtureId(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

export function normalizeStoryLocationFixtureIds(input: {
  locationFixtureId?: unknown;
  locationFixtureIds?: unknown;
}): string[] {
  const ids = Array.isArray(input.locationFixtureIds)
    ? input.locationFixtureIds.map(sanitizeLocationFixtureId)
    : [];
  const legacyId = sanitizeLocationFixtureId(input.locationFixtureId);
  if (legacyId) ids.unshift(legacyId);

  return Array.from(new Set(ids.filter(Boolean))).slice(
    0,
    MAX_STORY_LOCATION_FIXTURES
  );
}

export function getStoryLocationFixtureIds(
  story: Pick<Story, "locationFixtureId" | "locationFixtureIds">
): string[] {
  return normalizeStoryLocationFixtureIds({
    locationFixtureId: story.locationFixtureId,
    locationFixtureIds: story.locationFixtureIds,
  });
}

export async function resolveRequestedLocationFixtures(input: {
  userId: string;
  fixtureIds: string[];
}): Promise<{ fixtures: LocationFixture[]; invalidIds: string[] }> {
  if (input.fixtureIds.length === 0) {
    return { fixtures: [], invalidIds: [] };
  }

  const loaded = await Promise.all(
    input.fixtureIds.map((id) => db.locationFixtures.getById(id))
  );
  const fixtures: LocationFixture[] = [];
  const invalidIds: string[] = [];

  loaded.forEach((fixture, index) => {
    const requestedId = input.fixtureIds[index]!;
    if (!fixture || fixture.userId !== input.userId) {
      invalidIds.push(requestedId);
      return;
    }
    fixtures.push(fixture);
  });

  return { fixtures, invalidIds };
}

export async function getStoryLocationFixtures(input: {
  story: Pick<Story, "locationFixtureId" | "locationFixtureIds">;
  userId: string;
}): Promise<LocationFixture[]> {
  const fixtureIds = getStoryLocationFixtureIds(input.story);
  const { fixtures } = await resolveRequestedLocationFixtures({
    userId: input.userId,
    fixtureIds,
  });
  return fixtures;
}

export function buildStoryLocationHint(input: {
  fixtures: LocationFixture[];
  customLocationHint?: string;
}): string | undefined {
  const labels = input.fixtures.map(locationFixtureName);
  const custom = input.customLocationHint?.trim();
  if (custom) labels.push(custom);
  return labels.length > 0 ? labels.join("; ") : undefined;
}
