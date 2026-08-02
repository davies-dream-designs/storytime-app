import { db } from "@/lib/db";
import type { StoryPerson } from "@/types";

export function normalizeStoryPersonIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean)
    )
  );
}

export async function getSelectedStoryPeople(input: {
  userId: string;
  profileId: string;
  storyPersonIds: unknown;
}): Promise<StoryPerson[]> {
  const requestedIds = normalizeStoryPersonIds(input.storyPersonIds);
  if (requestedIds.length === 0) return [];

  const people = await db.storyPeople.getByIds(requestedIds, input.userId);
  return people.filter(
    (person) =>
      person.availableToAllProfiles ||
      person.profileIds.includes(input.profileId)
  );
}
