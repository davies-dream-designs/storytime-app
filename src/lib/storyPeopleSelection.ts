import { db } from "@/lib/db";
import {
  buildChildAppearanceSummary,
  formatAge,
  type ChildProfile,
  type StoryPerson,
} from "@/types";

export const CHILD_CAST_ID_PREFIX = "child:";

export function buildChildCastId(profileId: string): string {
  return `${CHILD_CAST_ID_PREFIX}${profileId}`;
}

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

  const childProfileIds = requestedIds
    .filter((id) => id.startsWith(CHILD_CAST_ID_PREFIX))
    .map((id) => id.slice(CHILD_CAST_ID_PREFIX.length))
    .filter((id) => id && id !== input.profileId);
  const storyPersonIds = requestedIds.filter(
    (id) => !id.startsWith(CHILD_CAST_ID_PREFIX)
  );

  const [people, profiles] = await Promise.all([
    storyPersonIds.length > 0
      ? db.storyPeople.getByIds(storyPersonIds, input.userId)
      : Promise.resolve([]),
    childProfileIds.length > 0
      ? db.profiles.getByUserId(input.userId)
      : Promise.resolve([]),
  ]);
  const allowedPeople = people.filter(
    (person) =>
      person.availableToAllProfiles ||
      person.profileIds.includes(input.profileId)
  );
  const requestedChildProfiles = new Set(childProfileIds);
  const childPeople = profiles
    .filter(
      (profile) =>
        requestedChildProfiles.has(profile.id) && profile.id !== input.profileId
    )
    .map(childProfileToStoryPerson);

  return [...allowedPeople, ...childPeople];
}

function childProfileToStoryPerson(profile: ChildProfile): StoryPerson {
  const appearance =
    profile.appearanceSummary ||
    buildChildAppearanceSummary(profile.appearance);
  return {
    id: buildChildCastId(profile.id),
    userId: profile.userId,
    name: profile.name,
    relationship: "sibling",
    pronouns:
      profile.gender && profile.gender !== "not_specified"
        ? profile.gender.replace("_", " ")
        : undefined,
    description: `Another child profile on this account, ${formatAge(profile)} old.`,
    personality: [
      ...(profile.lessons ?? []).slice(0, 3),
      ...(profile.favouriteActivities ?? []).slice(0, 2),
    ].join(", "),
    appearance,
    appearanceSummary: appearance,
    avatarImageUrl: profile.avatarImageUrl,
    availableToAllProfiles: true,
    profileIds: [],
    createdAt: profile.createdAt,
    updatedAt: profile.createdAt,
  };
}
