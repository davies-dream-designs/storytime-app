import { db } from "@/lib/db";
import {
  applySpreadIllustration,
  generateCoverIllustration,
  generateSpreadIllustration,
  getIllustrationConcurrency,
  isBookStoryIllustrationSpread,
} from "@/lib/print-books/illustrations";
import { getBookProjectStageLabel } from "@/lib/print-books/status";
import type {
  BookProject,
  CharacterBible,
  CharacterVisualReference,
} from "@/types/printBook";
import type { BuildContext } from "./context";
import { getProjectArtMode } from "./artState";
import { hasUnresolvedGeneratedPageImages } from "./utils";

export async function regenerateProjectArt(input: {
  id: string;
  project: BookProject;
  story: BuildContext["story"];
  profile: BuildContext["profile"];
  characterBible: CharacterBible;
  visualReferences?: CharacterVisualReference[];
  referenceSnapshotKey?: string;
  buildMode: "full" | "art";
}) {
  const totalArtSteps = input.project.spreads.length;
  const currentCursor = input.project.assets.artGenerationCursor ?? 0;

  if (currentCursor >= totalArtSteps) {
    return db.bookProjects.update(input.id, {
      status: "composing",
      currentStageLabel: getBookProjectStageLabel("composing"),
      beats: input.project.beats,
      characterBible: input.characterBible,
      completedSpreads: input.project.totalSpreads,
      totalSpreads: input.project.totalSpreads,
      assets: {
        ...input.project.assets,
        artGenerationCursor: undefined,
        artGenerationTotal: totalArtSteps,
        artMode: input.project.assets.artMode ?? "placeholder",
        lastBuildMode: input.buildMode,
        referenceSnapshotKey: input.referenceSnapshotKey,
        referenceImageCount: input.visualReferences?.length ?? 0,
      },
    });
  }

  if (currentCursor === 0) {
    const cover = await generateCoverIllustration({
      project: input.project,
      story: input.story,
      profile: input.profile,
      characterBible: input.characterBible,
      visualReferences: input.visualReferences,
    });

    return db.bookProjects.update(input.id, {
      status: "illustrating",
      currentStageLabel: "Generating final art...",
      characterBible: input.characterBible,
      spreads: cover.spreads,
      completedSpreads: 1,
      totalSpreads: totalArtSteps,
      assets: {
        ...input.project.assets,
        coverImageUrl: cover.coverImageUrl,
        coverWebImageUrl: cover.coverWebImageUrl,
        artMode: cover.provider === "openai" ? "generated" : "placeholder",
        lastBuildMode: input.buildMode,
        artGenerationCursor: 1,
        artGenerationTotal: totalArtSteps,
        referenceSnapshotKey: input.referenceSnapshotKey,
        referenceImageCount: input.visualReferences?.length ?? 0,
      },
    });
  }

  const concurrency = getIllustrationConcurrency();
  const spreadWindow = input.project.spreads.slice(
    currentCursor,
    currentCursor + concurrency
  );

  if (spreadWindow.length === 0) {
    return db.bookProjects.update(input.id, {
      status: "composing",
      currentStageLabel: getBookProjectStageLabel("composing"),
      beats: input.project.beats,
      characterBible: input.characterBible,
      completedSpreads: input.project.totalSpreads,
      totalSpreads: input.project.totalSpreads,
      assets: {
        ...input.project.assets,
        artGenerationCursor: undefined,
        artGenerationTotal: totalArtSteps,
        artMode: input.project.assets.artMode ?? "placeholder",
        lastBuildMode: input.buildMode,
        referenceSnapshotKey: input.referenceSnapshotKey,
        referenceImageCount: input.visualReferences?.length ?? 0,
      },
    });
  }

  const windowResults = await Promise.all(
    spreadWindow.map((s) =>
      isBookStoryIllustrationSpread(s)
        ? generateSpreadIllustration({
            project: input.project,
            story: input.story,
            profile: input.profile,
            characterBible: input.characterBible,
            visualReferences: input.visualReferences,
            spread: s,
          })
        : Promise.resolve(null)
    )
  );

  const finalResults = await Promise.all(
    windowResults.map((result, i) => {
      if (!result || !result.spread.leftPageImageError)
        return Promise.resolve(result);
      const s = spreadWindow[i]!;
      return generateSpreadIllustration({
        project: input.project,
        story: input.story,
        profile: input.profile,
        characterBible: input.characterBible,
        visualReferences: input.visualReferences,
        spread: s,
      });
    })
  );

  let illustratedSpreads = input.project.spreads;
  for (const result of finalResults) {
    if (result) {
      illustratedSpreads = applySpreadIllustration(
        illustratedSpreads,
        result.spread
      );
    }
  }

  const nextCursor = currentCursor + spreadWindow.length;
  const spreadProviders = illustratedSpreads
    .filter((s) => s.sequence > 1 && (s.leftPageImageUrl ?? s.imageUrl))
    .map((s) => {
      const url = s.leftPageImageUrl ?? s.imageUrl ?? "";
      return url.includes("/spreads/") && url.endsWith(".png")
        ? "openai"
        : "placeholder";
    }) as Array<"openai" | "placeholder">;

  if (nextCursor >= totalArtSteps) {
    if (hasUnresolvedGeneratedPageImages(illustratedSpreads)) {
      return db.bookProjects.update(input.id, {
        status: "failed",
        currentStageLabel: "One or more images need to be retried.",
        errorCode: "illustrating:image_failed",
        errorMessage:
          "One or more images failed to generate. Retry only the failed image from the spread review.",
        beats: input.project.beats,
        characterBible: input.characterBible,
        spreads: illustratedSpreads,
        completedSpreads: totalArtSteps,
        totalSpreads: totalArtSteps,
        assets: {
          ...input.project.assets,
          artMode: getProjectArtMode({
            coverProvider: input.project.assets.coverImageUrl?.endsWith(".png")
              ? "openai"
              : "placeholder",
            spreadProviders,
            existingArtMode: input.project.assets.artMode,
          }),
          lastBuildMode: input.buildMode,
          artGenerationCursor: undefined,
          artGenerationTotal: totalArtSteps,
          referenceSnapshotKey: input.referenceSnapshotKey,
          referenceImageCount: input.visualReferences?.length ?? 0,
        },
      });
    }

    return db.bookProjects.update(input.id, {
      status: "composing",
      currentStageLabel: getBookProjectStageLabel("composing"),
      beats: input.project.beats,
      characterBible: input.characterBible,
      spreads: illustratedSpreads,
      completedSpreads: totalArtSteps,
      totalSpreads: totalArtSteps,
      assets: {
        ...input.project.assets,
        artMode: getProjectArtMode({
          coverProvider: input.project.assets.coverImageUrl?.endsWith(".png")
            ? "openai"
            : "placeholder",
          spreadProviders,
          existingArtMode: input.project.assets.artMode,
        }),
        lastBuildMode: input.buildMode,
        artGenerationCursor: undefined,
        artGenerationTotal: totalArtSteps,
        referenceSnapshotKey: input.referenceSnapshotKey,
        referenceImageCount: input.visualReferences?.length ?? 0,
      },
    });
  }

  return db.bookProjects.update(input.id, {
    status: "illustrating",
    currentStageLabel: "Generating final art...",
    characterBible: input.characterBible,
    spreads: illustratedSpreads,
    completedSpreads: nextCursor,
    totalSpreads: totalArtSteps,
    assets: {
      ...input.project.assets,
      artMode: getProjectArtMode({
        coverProvider: input.project.assets.coverImageUrl?.endsWith(".png")
          ? "openai"
          : "placeholder",
        spreadProviders,
        existingArtMode: input.project.assets.artMode,
      }),
      lastBuildMode: input.buildMode,
      artGenerationCursor: nextCursor,
      artGenerationTotal: totalArtSteps,
      referenceSnapshotKey: input.referenceSnapshotKey,
      referenceImageCount: input.visualReferences?.length ?? 0,
    },
  });
}
