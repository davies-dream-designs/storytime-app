import { db } from "@/lib/db";
import type { BookProject } from "@/types/printBook";

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

  return {
    story,
    profile,
    characters: characters.filter(
      (character) => character.userId === project.userId
    ),
  };
}

export type BuildContext = Awaited<ReturnType<typeof loadBuildContext>>;
