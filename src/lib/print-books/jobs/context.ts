import { db } from "@/lib/db";
import {
  buildChildAppearanceSummary,
  getStoryPersonRelationshipLabel,
} from "@/types";
import {
  getBodyBuildIllustrationCue,
  getBodyBuildLabel,
} from "@/types/bodyBuild";
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
    const structuredAppearance = buildChildAppearanceSummary(profile.appearance);
    const appearance = [
      structuredAppearance
        ? `Latest child profile appearance: ${structuredAppearance}.`
        : "",
      profile.appearanceSummary
        ? `Previous generated child reference summary, use only when it does not conflict with the latest profile appearance: ${profile.appearanceSummary}.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    visualReferences.push({
      id: `profile:${profile.id}`,
      name: profile.name,
      role: "main_child",
      imageUrl: profile.avatarImageUrl,
      appearance: appearance || undefined,
    });
  }
  for (const person of storyPeople) {
    if (!person.avatarImageUrl) continue;
    const bodyBuildCue = getBodyBuildIllustrationCue(person.bodyBuild);
    const appearance = [
      person.appearance.trim()
        ? `Latest edited appearance: ${person.appearance.trim()}.`
        : "",
      person.bodyBuild && person.bodyBuild !== "not_specified"
        ? `Latest body build: ${getBodyBuildLabel(person.bodyBuild)}.`
        : "",
      bodyBuildCue ? `Illustration body-build cue: ${bodyBuildCue}.` : "",
      person.appearanceSummary?.trim()
        ? `Previous generated reference summary, use only when it does not conflict with latest edited appearance/body build: ${person.appearanceSummary.trim()}`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    visualReferences.push({
      id: `person:${person.id}`,
      name: person.name,
      role: "family_friend_pet",
      relationship: getStoryPersonRelationshipLabel(person),
      imageUrl: person.avatarImageUrl,
      appearance: appearance || undefined,
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
