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
  ContinuityVisualReference,
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
    // Generate one interior page first so the cover can copy each character's
    // established outfit and look from real page art (the character bible and
    // avatar reference intentionally strip outfits, so a text-only cover drifts
    // to the plain reference-portrait clothing).
    //
    // Prefer a seed page where the family member actually appears; otherwise
    // their outfit has no interior reference and the cover falls back to their
    // neutral avatar portrait.
    const familyNames = (input.visualReferences ?? [])
      .filter((reference) => reference.role === "family_friend_pet")
      .map((reference) => reference.name.trim().toLowerCase())
      .filter(Boolean);
    const spreadIncludesFamily = (spread: BookProject["spreads"][number]) => {
      const text =
        `${spread.leftPageText} ${spread.rightPageText} ${spread.sceneBrief} ${spread.illustrationPrompt}`.toLowerCase();
      return familyNames.some((name) => text.includes(name));
    };

    let seedIndex =
      familyNames.length > 0
        ? input.project.spreads.findIndex(
            (s) => isBookStoryIllustrationSpread(s) && spreadIncludesFamily(s)
          )
        : -1;
    if (seedIndex === -1) {
      seedIndex = input.project.spreads.findIndex((s) =>
        isBookStoryIllustrationSpread(s)
      );
    }

    let seededSpreads = input.project.spreads;
    let continuityReferences: ContinuityVisualReference[] | undefined;
    let nextCursor = 1;

    if (seedIndex !== -1) {
      const seedResult = await generateSpreadIllustration({
        project: input.project,
        story: input.story,
        profile: input.profile,
        characterBible: input.characterBible,
        visualReferences: input.visualReferences,
        referenceSnapshotKey: input.referenceSnapshotKey,
        spread: input.project.spreads[seedIndex]!,
      });
      seededSpreads = applySpreadIllustration(seededSpreads, seedResult.spread);

      const seed = seedResult.spread;
      const seedImage = seed.leftPageImageError
        ? undefined
        : (seed.leftPageImageUrl ?? seed.imageUrl);
      if (
        seedImage &&
        seedImage.includes("/spreads/") &&
        seedImage.endsWith(".png")
      ) {
        continuityReferences = [
          {
            id: `spread:${seed.id}`,
            label: `Approved spread ${seed.sequence}`,
            imageUrl: seedImage,
            source: "spread",
            sequence: seed.sequence,
          },
        ];
      }
      nextCursor = seedIndex + 1;
    }

    const cover = await generateCoverIllustration({
      project: { ...input.project, spreads: seededSpreads },
      story: input.story,
      profile: input.profile,
      characterBible: input.characterBible,
      // Keep real character portraits attached for identity (especially family
      // members that may not appear in the seed page). The cover prompt and
      // continuity art remain the source of truth for outfits.
      visualReferences: input.visualReferences,
      continuityReferences,
    });

    return db.bookProjects.update(input.id, {
      status: "illustrating",
      currentStageLabel: "Generating final art...",
      characterBible: input.characterBible,
      spreads: cover.spreads,
      completedSpreads: nextCursor,
      totalSpreads: totalArtSteps,
      assets: {
        ...input.project.assets,
        coverImageUrl: cover.coverImageUrl,
        coverWebImageUrl: cover.coverWebImageUrl,
        artMode: cover.provider === "openai" ? "generated" : "placeholder",
        lastBuildMode: input.buildMode,
        artGenerationCursor: nextCursor,
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
            referenceSnapshotKey: input.referenceSnapshotKey,
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
        referenceSnapshotKey: input.referenceSnapshotKey,
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
