import { db } from "@/lib/db";
import {
  buildChildAppearanceSummary,
  getStoryPersonAppearanceContext,
  getStoryPersonRelationshipLabel,
} from "@/types";
import type {
  BookProject,
  CharacterVisualReference,
} from "@/types/printBook";

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

  const storyPeople = await db.storyPeople.getByIds(
    story.storyPersonIds ?? [],
    project.userId
  );

  const visualReferences: CharacterVisualReference[] = [];
  if (profile.avatarImageUrl) {
    visualReferences.push({
      id: `profile:${profile.id}`,
      name: profile.name,
      role: "main_child",
      imageUrl: profile.avatarImageUrl,
      appearance:
        profile.appearanceSummary ||
        buildChildAppearanceSummary(profile.appearance) ||
        undefined,
    });
  }
  for (const person of storyPeople) {
    if (!person.avatarImageUrl) continue;
    visualReferences.push({
      id: `person:${person.id}`,
      name: person.name,
      role: "family_friend_pet",
      relationship: getStoryPersonRelationshipLabel(person),
      imageUrl: person.avatarImageUrl,
      appearance: getStoryPersonAppearanceContext(person) || undefined,
    });
  }

  const referenceSnapshotKey = [
    "profile",
    profile.id,
    normalizeSnapshotPart(profile.avatarImageUrl),
    normalizeSnapshotPart(profile.appearanceSummary),
    normalizeSnapshotPart(buildChildAppearanceSummary(profile.appearance)),
    ...storyPeople.flatMap((person) => [
      "person",
      person.id,
      normalizeSnapshotPart(person.avatarImageUrl),
      normalizeSnapshotPart(person.appearanceSummary),
      normalizeSnapshotPart(person.appearance),
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
