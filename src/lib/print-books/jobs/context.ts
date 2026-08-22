import { db } from "@/lib/db";
import {
  buildChildAppearanceSummary,
  getStoryPersonRelationshipLabel,
} from "@/types";
import {
  buildChildCanonicalAppearanceContext,
  buildStoryPersonCanonicalAppearanceContext,
  isChildProfileReferenceStale,
  isStoryPersonReferenceStale,
} from "@/lib/characterReferenceContext";
import { getSelectedStoryPeople } from "@/lib/storyPeopleSelection";
import type { BookProject, CharacterVisualReference } from "@/types/printBook";

function normalizeSnapshotPart(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export async function loadBuildContext(project: BookProject) {
  const [story, profile, characters] = await Promise.all([
    db.stories.getById(project.sourceStoryId),
    db.profiles.getById(project.profileId),
    db.characters.getByProfileId(project.profileId),
  ]);

  if (!story || story.userId !== project.userId) {
    throw new Error("Source story not found");
  }

  if (!profile || profile.userId !== project.userId) {
    throw new Error("Profile not found");
  }

  const storyPeople = await getSelectedStoryPeople({
    userId: project.userId,
    profileId: project.profileId,
    storyPersonIds: story.storyPersonIds ?? [],
  });

  const visualReferences: CharacterVisualReference[] = [];
  if (profile.avatarImageUrl) {
    const appearance = buildChildCanonicalAppearanceContext(profile);
    visualReferences.push({
      id: `profile:${profile.id}`,
      name: profile.name,
      role: "main_child",
      imageUrl: profile.avatarImageUrl,
      appearance: appearance || undefined,
      isStale: isChildProfileReferenceStale(profile),
    });
  }
  for (const person of storyPeople) {
    if (!person.avatarImageUrl) continue;
    const appearance = buildStoryPersonCanonicalAppearanceContext(person);
    visualReferences.push({
      id: `person:${person.id}`,
      name: person.name,
      role: "family_friend_pet",
      relationship: getStoryPersonRelationshipLabel(person),
      imageUrl: person.avatarImageUrl,
      appearance: appearance || undefined,
      isStale: isStoryPersonReferenceStale(person),
    });
  }

  const referenceSnapshotKey = [
    "profile",
    profile.id,
    normalizeSnapshotPart(profile.avatarImageUrl),
    normalizeSnapshotPart(profile.appearanceSummary),
    normalizeSnapshotPart(profile.avatarTraitHash),
    normalizeSnapshotPart(buildChildAppearanceSummary(profile.appearance)),
    ...storyPeople.flatMap((person) => [
      "person",
      person.id,
      normalizeSnapshotPart(person.avatarImageUrl),
      normalizeSnapshotPart(person.appearanceSummary),
      normalizeSnapshotPart(person.avatarTraitHash),
      normalizeSnapshotPart(person.appearance),
      normalizeSnapshotPart(person.ageGroup),
      normalizeSnapshotPart(person.height),
      normalizeSnapshotPart(person.bodyBuild),
      normalizeSnapshotPart(person.updatedAt),
    ]),
  ].join("|");

  return {
    story,
    profile,
    characters: characters.filter(
      (character) => character.userId === project.userId
    ),
    storyPeople,
    visualReferences,
    referenceSnapshotKey,
  };
}

export type BuildContext = Awaited<ReturnType<typeof loadBuildContext>>;
