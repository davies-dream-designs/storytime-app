import { after } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import type { ChildProfile, Story } from "@/types";
import { deriveBeatsFromStory } from "@/lib/print-books/beats";
import { generateCharacterBible } from "@/lib/print-books/characterBible";
import { composePrintBookSpreads } from "@/lib/print-books/composer";
import {
  applySpreadIllustration,
  applyBookImageBatchOutput,
  downloadBookImageBatchOutput,
  generateCoverIllustration,
  generateSpreadIllustration,
  isGeneratedIllustrationConfigured,
  retrieveBookImageBatch,
  submitBookImageBatch,
} from "@/lib/print-books/illustrations";
import { generateBookPdfs } from "@/lib/print-books/pdf";
import { generateBookEpub } from "@/lib/print-books/epub";
import {
  captureIllustratedBookCredits,
  refundIllustratedBookCredits,
  reserveIllustratedBookCredits,
} from "@/lib/credits";
import { runStorycotPrintProofing } from "@/lib/print-books/proofing";
import { BOOK_SPEC } from "@/lib/print-books/bookConfig";
import { getBookProjectStageLabel } from "@/lib/print-books/status";
import { sendBookReadyEmail } from "@/lib/email";
import type {
  BookArtMode,
  BookBuildJob,
  BookBuildJobStatus,
  BookBuildMode,
  BookProject,
  BookProjectStatus,
  CharacterBible,
} from "@/types/printBook";

export const BOOK_JOB_STALE_MS = 20_000;
export const BOOK_IMAGE_BATCH_POLL_WAIT_MS = 60_000;

function getNowIso() {
  return new Date().toISOString();
}

function isTerminalJobStatus(status: BookBuildJobStatus) {
  return status === "completed" || status === "failed";
}

function getNextProofVersion(project: BookProject): number {
  return (project.assets.proofVersion ?? 0) + 1;
}

function getProjectArtMode(input: {
  coverProvider?: "openai" | "placeholder";
  spreadProviders?: Array<"openai" | "placeholder">;
  existingArtMode?: BookArtMode;
}): BookArtMode {
  const providers = new Set<string>();
  if (input.coverProvider) providers.add(input.coverProvider);
  for (const provider of input.spreadProviders ?? []) providers.add(provider);
  if (providers.size === 0) return input.existingArtMode ?? "placeholder";
  if (providers.size === 1)
    return providers.has("openai") ? "generated" : "placeholder";
  return "mixed";
}

export function isBookBuildJobStale(job: BookBuildJob, now = Date.now()) {
  if (isTerminalJobStatus(job.status)) return false;
  const updatedAt = Date.parse(job.updatedAt);
  if (Number.isNaN(updatedAt)) return true;
  return now - updatedAt > BOOK_JOB_STALE_MS;
}

function getQueuedStageLabel(mode: BookBuildMode, project: BookProject) {
  switch (mode) {
    case "art":
      return `Queued to generate final art for ${project.spreads.length} spreads...`;
    case "exports":
      return "Queued to refresh export files...";
    case "finalize":
      return "Queued to finalize the order package...";
    default:
      return getBookProjectStageLabel("queued");
  }
}

function userMessageForErrorCode(errorCode: string): string {
  if (errorCode.startsWith("planning")) return "We hit a snag planning the book. Hit retry — it usually clears up.";
  if (errorCode.startsWith("bible")) return "The character setup didn't finish. Retry to pick up where it left off.";
  if (errorCode.startsWith("illustrating")) return "Illustrations didn't finish generating. Retry and we'll pick up from where it stopped.";
  return "The illustrated book didn't finish. Your credits have been refunded. Hit retry to try again.";
}

async function markJobProjectFailure(
  project: BookProject,
  jobId: string,
  errorCode: string,
  message: string
) {
  await refundIllustratedBookCredits(project);

  await db.bookProjects.update(project.id, {
    status: "failed",
    currentStageLabel: getBookProjectStageLabel("failed"),
    errorCode,
    errorMessage: userMessageForErrorCode(errorCode),
    rawError: message,
    assets: {
      ...project.assets,
      activeJobId: undefined,
      activeJobMode: undefined,
      activeJobStatus: undefined,
      activeJobUpdatedAt: undefined,
    },
  });

  await Promise.all([
    db.bookBuildJobs.update(jobId, {
      status: "failed",
      errorMessage: message,
      completedAt: getNowIso(),
    }),
    db.bookProjects.addToFailedIndex(project.id),
  ]);
}

async function loadBuildContext(project: BookProject) {
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

async function regenerateProjectArt(input: {
  id: string;
  project: BookProject;
  story: Story;
  profile: ChildProfile;
  characterBible: CharacterBible;
  buildMode: "full" | "art";
}) {
  const totalArtSteps = input.project.spreads.length;
  const currentCursor = input.project.assets.artGenerationCursor ?? 0;

  if (isGeneratedIllustrationConfigured()) {
    const existingBatch = input.project.assets.openAIImageBatch;

    if (!existingBatch) {
      const batch = await submitBookImageBatch(input);
      return db.bookProjects.update(input.id, {
        status: "illustrating",
        currentStageLabel: `Queued final art batch with ${batch.requestCount} images...`,
        characterBible: input.characterBible,
        completedSpreads: 0,
        totalSpreads: totalArtSteps,
        assets: {
          ...input.project.assets,
          artMode: "generated",
          lastBuildMode: input.buildMode,
          artGenerationCursor: 0,
          artGenerationTotal: totalArtSteps,
          openAIImageBatch: batch,
        },
      });
    }

    const batch = await retrieveBookImageBatch(existingBatch);

    if (
      batch.status === "failed" ||
      batch.status === "expired" ||
      batch.status === "cancelled"
    ) {
      throw new Error(
        `OpenAI image batch ${batch.batchId} ended with status ${batch.status}`
      );
    }

    if (batch.status !== "completed") {
      return db.bookProjects.update(input.id, {
        status: "illustrating",
        currentStageLabel: "Waiting for final art batch...",
        characterBible: input.characterBible,
        completedSpreads: 0,
        totalSpreads: totalArtSteps,
        assets: {
          ...input.project.assets,
          artMode: "generated",
          lastBuildMode: input.buildMode,
          artGenerationCursor: 0,
          artGenerationTotal: totalArtSteps,
          openAIImageBatch: batch,
        },
      });
    }

    const outputText = await downloadBookImageBatchOutput(batch);
    const illustrated = await applyBookImageBatchOutput({
      ...input,
      outputText,
    });

    return db.bookProjects.update(input.id, {
      status: "composing",
      currentStageLabel: getBookProjectStageLabel("composing"),
      beats: input.project.beats,
      characterBible: input.characterBible,
      spreads: illustrated.spreads,
      completedSpreads: totalArtSteps,
      totalSpreads: totalArtSteps,
      assets: {
        ...input.project.assets,
        coverImageUrl: illustrated.coverImageUrl,
        artMode: illustrated.provider === "openai" ? "generated" : "mixed",
        lastBuildMode: input.buildMode,
        artGenerationCursor: undefined,
        artGenerationTotal: totalArtSteps,
        openAIImageBatch: batch,
      },
    });
  }

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
      },
    });
  }

  if (currentCursor === 0) {
    const cover = await generateCoverIllustration({
      project: input.project,
      story: input.story,
      profile: input.profile,
      characterBible: input.characterBible,
    });

    return db.bookProjects.update(input.id, {
      status: "illustrating",
      currentStageLabel: `Generating final art 1 of ${totalArtSteps}...`,
      characterBible: input.characterBible,
      spreads: cover.spreads,
      completedSpreads: 1,
      totalSpreads: totalArtSteps,
      assets: {
        ...input.project.assets,
        coverImageUrl: cover.coverImageUrl,
        artMode: cover.provider === "openai" ? "generated" : "placeholder",
        lastBuildMode: input.buildMode,
        artGenerationCursor: 1,
        artGenerationTotal: totalArtSteps,
      },
    });
  }

  const spread = input.project.spreads[currentCursor];
  if (!spread) {
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
      },
    });
  }

  const illustrated = await generateSpreadIllustration({
    project: input.project,
    story: input.story,
    profile: input.profile,
    characterBible: input.characterBible,
    spread,
  });

  const illustratedSpreads = applySpreadIllustration(
    input.project.spreads,
    illustrated.spread
  );
  const nextCursor = currentCursor + 1;
  const spreadProviders = illustratedSpreads
    .filter(
      (currentSpread) =>
        currentSpread.sequence > 1 &&
        (currentSpread.leftPageImageUrl ?? currentSpread.imageUrl)
    )
    .map((currentSpread) => {
      const url =
        currentSpread.leftPageImageUrl ?? currentSpread.imageUrl ?? "";
      return url.includes("/spreads/") && url.endsWith(".png")
        ? "openai"
        : "placeholder";
    }) as Array<"openai" | "placeholder">;

  if (nextCursor >= totalArtSteps) {
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
      },
    });
  }

  return db.bookProjects.update(input.id, {
    status: "illustrating",
    currentStageLabel: `Generating final art ${nextCursor + 1} of ${totalArtSteps}...`,
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
    },
  });
}

async function finalizeProjectExports(input: {
  id: string;
  project: BookProject;
  story: Story;
  profile: ChildProfile;
  buildMode: BookBuildMode;
}) {
  const nextProofVersion = getNextProofVersion(input.project);
  const pdfAssets = await generateBookPdfs({
    project: input.project,
    story: input.story,
    profile: input.profile,
  });
  const epubAssets = await generateBookEpub({
    project: input.project,
    story: input.story,
    profile: input.profile,
  });

  const proofingAssets = {
    ...input.project.assets,
    coverImageUrl: input.project.assets.coverImageUrl,
    coverPdfUrl: pdfAssets.coverPdfUrl,
    coverPdfReadyForOrdering: pdfAssets.coverPdfReadyForOrdering,
    coverPdfSpineWidthIn: pdfAssets.coverPdfSpineWidthIn,
    coverPdfSpineSource: pdfAssets.coverPdfSpineSource,
    coverPdfPageWidthIn: pdfAssets.coverPdfPageWidthIn,
    coverPdfPageHeightIn: pdfAssets.coverPdfPageHeightIn,
    coverSpineTextIncluded: pdfAssets.coverSpineTextIncluded,
    previewPdfUrl: undefined,
    previewPdfPageWidthIn: undefined,
    previewPdfPageHeightIn: undefined,
    printPdfUrl: pdfAssets.printPdfUrl,
    epubUrl: epubAssets.epubUrl,
    printPdfPageWidthIn: pdfAssets.printPdfPageWidthIn,
    printPdfPageHeightIn: pdfAssets.printPdfPageHeightIn,
    interiorTextSafeMarginIn: pdfAssets.interiorTextSafeMarginIn,
    previewImages: pdfAssets.previewImages,
  };

  const proofingReport = runStorycotPrintProofing(
    {
      ...input.project,
      assets: proofingAssets,
    },
    { strictForOrdering: input.buildMode === "finalize" }
  );

  const finalizedAt =
    input.buildMode === "finalize" &&
    proofingReport.orderabilityState === "order_ready"
      ? getNowIso()
      : undefined;

  const proofingProject = await db.bookProjects.update(input.id, {
    status: "proofing",
    currentStageLabel:
      input.buildMode === "finalize"
        ? "Finalizing the order package..."
        : getBookProjectStageLabel("proofing"),
    assets: {
      ...proofingAssets,
      exportVersion: nextProofVersion,
      finalExportVersion: finalizedAt
        ? nextProofVersion
        : input.project.assets.finalExportVersion,
      lastBuildMode: input.buildMode,
      orderabilityState: proofingReport.orderabilityState,
      finalizedAt,
      exportProfile: BOOK_SPEC.trimLabel,
      proofVersion: nextProofVersion,
      proofingPassed: proofingReport.passed,
      proofingChecks: proofingReport.checks,
      proofingWarnings: proofingReport.warnings,
      proofingErrors: proofingReport.errors,
    },
  });

  if (!proofingProject) return undefined;

  const readyAt = getNowIso();
  return db.bookProjects.update(input.id, {
    status: "ready",
    currentStageLabel: getBookProjectStageLabel("ready"),
    readyAt,
    assets: {
      ...proofingProject.assets,
    },
  });
}

async function advanceFullBuild(
  project: BookProject,
  context: Awaited<ReturnType<typeof loadBuildContext>>
) {
  if (
    project.status === "queued" ||
    project.status === "planning" ||
    !project.beats.length
  ) {
    const beats = deriveBeatsFromStory(context.story);
    return db.bookProjects.update(project.id, {
      status: "bible",
      currentStageLabel: getBookProjectStageLabel("bible"),
      errorCode: undefined,
      errorMessage: undefined,
      beats,
      completedSpreads: 0,
      totalSpreads: project.spreadCount,
    });
  }

  if (
    project.status === "bible" ||
    !project.characterBible ||
    !project.spreads.length
  ) {
    const characterBible = await generateCharacterBible({
      profile: context.profile,
      story: context.story,
      characters: context.characters,
    });

    const spreads = composePrintBookSpreads({
      bookProjectId: project.id,
      story: context.story,
      profile: context.profile,
      ageBand: project.ageBand,
      beats: project.beats,
      characterBible,
    });

    return db.bookProjects.update(project.id, {
      status: "illustrating",
      currentStageLabel: getBookProjectStageLabel("illustrating"),
      characterBible,
      spreads,
      completedSpreads: 0,
      totalSpreads: spreads.length,
      assets: {
        ...project.assets,
        lastBuildMode: "full",
        artGenerationCursor: 0,
        artGenerationTotal: spreads.length,
      },
    });
  }

  if (project.status === "illustrating") {
    return regenerateProjectArt({
      id: project.id,
      project,
      story: context.story,
      profile: context.profile,
      characterBible: project.characterBible,
      buildMode: "full",
    });
  }

  if (project.status === "composing") {
    return finalizeProjectExports({
      id: project.id,
      project,
      story: context.story,
      profile: context.profile,
      buildMode: "full",
    });
  }

  return project;
}

async function advanceArtBuild(
  project: BookProject,
  context: Awaited<ReturnType<typeof loadBuildContext>>
) {
  if (!project.characterBible || !project.spreads.length) {
    throw new Error(
      "This book does not have a complete draft to illustrate yet."
    );
  }

  if (project.status === "illustrating") {
    return regenerateProjectArt({
      id: project.id,
      project,
      story: context.story,
      profile: context.profile,
      characterBible: project.characterBible,
      buildMode: "art",
    });
  }

  if (project.status === "composing") {
    return finalizeProjectExports({
      id: project.id,
      project,
      story: context.story,
      profile: context.profile,
      buildMode: "art",
    });
  }

  return project;
}

async function advanceExportBuild(
  project: BookProject,
  context: Awaited<ReturnType<typeof loadBuildContext>>,
  mode: "exports" | "finalize"
) {
  if (!project.spreads.length || !project.assets.coverImageUrl) {
    throw new Error("This book does not have a complete draft to refresh yet.");
  }

  return finalizeProjectExports({
    id: project.id,
    project,
    story: context.story,
    profile: context.profile,
    buildMode: mode,
  });
}

function scheduleBookBuildJobContinuation(jobId: string, waitMs = 0) {
  after(async () => {
    try {
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      await continueBookBuildJob(jobId);
    } catch (error) {
      console.error("Book build continuation failed", { jobId, error });
    }
  });
}

export async function continueBookBuildJob(jobId: string) {
  const result = await processBookBuildJob(jobId);

  if (result.shouldContinue) {
    scheduleBookBuildJobContinuation(jobId, result.waitMs);
  }

  return result;
}

export async function dispatchBookBuildJob(job: BookBuildJob) {
  return continueBookBuildJob(job.id);
}

export async function enqueueBookBuildJob(input: {
  project: BookProject;
  mode: BookBuildMode;
  baseUrl: string;
}) {
  const currentJob = await db.bookBuildJobs.getCurrentByProjectId(
    input.project.id
  );
  if (currentJob && !isTerminalJobStatus(currentJob.status)) {
    if (currentJob.mode !== input.mode) {
      throw new Error(
        `A ${currentJob.mode} build is already running for this book.`
      );
    }

    return {
      job: currentJob,
      project: input.project,
      alreadyQueued: true,
    };
  }

  if (input.mode === "art" && !isGeneratedIllustrationConfigured()) {
    throw new Error(
      "Final art generation needs OPENAI_API_KEY plus blob storage before it can run."
    );
  }

  if (
    (input.mode === "exports" || input.mode === "finalize") &&
    (!input.project.spreads.length || !input.project.assets.coverImageUrl)
  ) {
    throw new Error("This book does not have a complete draft to refresh yet.");
  }

  if (
    input.mode === "art" &&
    (!input.project.spreads.length || !input.project.characterBible)
  ) {
    throw new Error(
      "This book does not have a complete draft to illustrate yet."
    );
  }

  const billableProject =
    input.mode === "full" || input.mode === "art"
      ? await reserveIllustratedBookCredits(input.project)
      : input.project;

  const createdAt = getNowIso();
  const job: BookBuildJob = {
    id: uuidv4(),
    projectId: billableProject.id,
    userId: billableProject.userId,
    mode: input.mode,
    status: "queued",
    step: 0,
    totalSteps:
      input.mode === "art" || input.mode === "full"
        ? billableProject.spreadCount
        : 1,
    token: uuidv4(),
    baseUrl: input.baseUrl,
    createdAt,
    updatedAt: createdAt,
  };

  await db.bookBuildJobs.create(job);

  const updatedProject = await db.bookProjects.update(billableProject.id, {
    status:
      input.mode === "full"
        ? "queued"
        : input.mode === "art"
          ? "illustrating"
          : input.mode === "finalize"
            ? "proofing"
            : "composing",
    currentStageLabel: getQueuedStageLabel(input.mode, billableProject),
    errorCode: undefined,
    errorMessage: undefined,
    completedSpreads:
      input.mode === "art" ? 0 : billableProject.completedSpreads,
    totalSpreads:
      input.mode === "art"
        ? billableProject.spreads.length
        : billableProject.totalSpreads,
    assets: {
      ...billableProject.assets,
      activeJobId: job.id,
      activeJobMode: input.mode,
      activeJobStatus: "queued",
      activeJobUpdatedAt: createdAt,
      lastBuildMode: input.mode,
      artGenerationCursor:
        input.mode === "art" ? 0 : billableProject.assets.artGenerationCursor,
      artGenerationTotal:
        input.mode === "art"
          ? billableProject.spreads.length
          : billableProject.assets.artGenerationTotal,
      openAIImageBatch:
        input.mode === "art" || input.mode === "full"
          ? undefined
          : billableProject.assets.openAIImageBatch,
    },
  });

  if (!updatedProject) {
    throw new Error("Book project not found");
  }

  return {
    job,
    project: updatedProject,
    alreadyQueued: false,
  };
}

export async function processBookBuildJob(jobId: string) {
  const job = await db.bookBuildJobs.getById(jobId);
  if (!job) {
    throw new Error("Job not found");
  }

  if (isTerminalJobStatus(job.status)) {
    return { job, shouldContinue: false };
  }

  const runningJob = await db.bookBuildJobs.update(job.id, {
    status: "running",
    startedAt: job.startedAt ?? getNowIso(),
  });

  if (!runningJob) {
    throw new Error("Job not found");
  }

  const project = await db.bookProjects.getById(job.projectId);
  if (!project || project.userId !== job.userId) {
    await db.bookBuildJobs.update(job.id, {
      status: "failed",
      errorMessage: "Book project not found",
      completedAt: getNowIso(),
    });
    throw new Error("Book project not found");
  }

  try {
    const context = await loadBuildContext(project);
    let nextProject: BookProject | undefined;

    switch (runningJob.mode) {
      case "full":
        nextProject = await advanceFullBuild(project, context);
        break;
      case "art":
        nextProject = await advanceArtBuild(project, context);
        break;
      case "exports":
        nextProject = await advanceExportBuild(project, context, "exports");
        break;
      case "finalize":
        nextProject = await advanceExportBuild(project, context, "finalize");
        break;
      default:
        nextProject = project;
        break;
    }

    if (!nextProject) {
      throw new Error("Book project not found");
    }

    const terminalProject =
      nextProject.status === "ready" || nextProject.status === "failed";
    const nextJobStatus: BookBuildJobStatus = terminalProject
      ? nextProject.status === "ready"
        ? "completed"
        : "failed"
      : "running";
    const updatedJob = await db.bookBuildJobs.update(job.id, {
      status: nextJobStatus,
      step: runningJob.step + 1,
      currentStepLabel: nextProject.currentStageLabel,
      completedAt: terminalProject ? getNowIso() : undefined,
      errorMessage:
        nextProject.status === "failed" ? nextProject.errorMessage : undefined,
    });

    if (!updatedJob) {
      throw new Error("Job not found");
    }

    let finalProject = await db.bookProjects.update(project.id, {
      assets: {
        ...nextProject.assets,
        activeJobId: terminalProject ? undefined : job.id,
        activeJobMode: terminalProject ? undefined : job.mode,
        activeJobStatus: terminalProject ? undefined : updatedJob.status,
        activeJobUpdatedAt: updatedJob.updatedAt,
      },
    });

    if (terminalProject && nextProject.status === "ready") {
      finalProject = await captureIllustratedBookCredits(
        finalProject ?? nextProject
      );

      // Fire-and-forget — email failure must never break the build
      after(async () => {
        try {
          const { clerkClient } = await import("@clerk/nextjs/server");
          const clerk = await clerkClient();
          const user = await clerk.users.getUser(job.userId);
          const email = user.emailAddresses.find(
            (e) => e.id === user.primaryEmailAddressId
          )?.emailAddress;
          const firstName = user.firstName ?? context.profile.name ?? "there";
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://storycot.com";
          if (email) {
            await sendBookReadyEmail({
              toEmail: email,
              toName: firstName,
              storyTitle: context.story.title,
              bookId: project.id,
              appUrl,
            });
          }
        } catch (err) {
          console.error("Book ready email failed (non-fatal)", err);
        }
      });
    }

    const waitingForImageBatch =
      !terminalProject &&
      nextProject.status === "illustrating" &&
      nextProject.assets.openAIImageBatch &&
      nextProject.assets.openAIImageBatch.status !== "completed";

    return {
      job: updatedJob,
      project: finalProject ?? nextProject,
      shouldContinue: !terminalProject,
      waitMs: waitingForImageBatch ? BOOK_IMAGE_BATCH_POLL_WAIT_MS : undefined,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown build error";
    const failureCode: `${BookProjectStatus}_failed` =
      runningJob.mode === "finalize" || runningJob.mode === "exports"
        ? "proofing_failed"
        : runningJob.mode === "art"
          ? "illustrating_failed"
          : project.status === "queued" || project.status === "planning"
            ? "planning_failed"
            : project.status === "bible"
              ? "bible_failed"
              : project.status === "illustrating"
                ? "illustrating_failed"
                : "proofing_failed";

    await markJobProjectFailure(project, job.id, failureCode, message);
    throw error;
  }
}
