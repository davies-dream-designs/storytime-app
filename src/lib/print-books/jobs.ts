import { after } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { deriveBeatsFromStory } from "@/lib/print-books/beats";
import {
  enrichCharacterBibleWithLockedRules,
  generateCharacterBible,
} from "@/lib/print-books/characterBible";
import { composePrintBookSpreads } from "@/lib/print-books/composer";
import {
  applyPreferredFixturesToLocationBible,
  generateLocationBible,
} from "@/lib/print-books/locationBible";
import { getStoryLocationFixtures } from "@/lib/storyLocationFixtures";
import {
  applySpreadIllustration,
  generateLocationEstablishingImages,
  generateSpreadPageIllustration,
  isGeneratedIllustrationConfigured,
} from "@/lib/print-books/illustrations";
import {
  captureIllustratedBookCredits,
  reserveIllustratedBookCredits,
} from "@/lib/credits";
import { getEffectiveBookProjectStatus } from "@/lib/print-books/readiness";
import { getBookProjectStageLabel } from "@/lib/print-books/status";
import { sendBookReadyEmail } from "@/lib/email";
import { logEvent } from "@/lib/logEvent";
import { AppError } from "@/lib/errors";
import { regenerateProjectArt } from "@/lib/print-books/jobs/art";
import {
  markExportJobFailure,
  markJobProjectFailure,
} from "@/lib/print-books/jobs/failures";
import { deleteBookAssetUrls } from "@/lib/print-books/storage";
import {
  loadBuildContext,
  type BuildContext,
} from "@/lib/print-books/jobs/context";
import { finalizeProjectExports } from "@/lib/print-books/jobs/exports";
import {
  BOOK_JOB_STALE_MS,
  clearResolvedGeneratedPageImageErrors,
  getNowIso,
  getQueuedStageLabel,
  hasUnresolvedGeneratedPageImages,
  isBookBuildJobStale,
  isTerminalJobStatus,
  shouldSendBookReadyEmail,
} from "@/lib/print-books/jobs/utils";
import type {
  BookBuildJob,
  BookBuildJobStatus,
  BookBuildMode,
  BookProject,
  BookProjectStatus,
  BookSpread,
} from "@/types/printBook";

export { BOOK_JOB_STALE_MS, isBookBuildJobStale, shouldSendBookReadyEmail };

async function advanceFullBuild(project: BookProject, context: BuildContext) {
  if (
    project.status === "queued" ||
    project.status === "planning" ||
    !project.beats.length ||
    (project.assets.lastBuildMode === "full" &&
      project.assets.referenceSnapshotKey !== context.referenceSnapshotKey)
  ) {
    const beats = deriveBeatsFromStory(context.story);
    return db.bookProjects.update(project.id, {
      status: "bible",
      currentStageLabel: getBookProjectStageLabel("bible"),
      errorCode: undefined,
      errorMessage: undefined,
      beats,
      characterBible: undefined,
      spreads: [],
      completedSpreads: 0,
      totalSpreads: project.spreadCount,
      assets: {
        ...project.assets,
        referenceSnapshotKey: context.referenceSnapshotKey,
        referenceImageCount: context.visualReferences.length,
      },
    });
  }

  if (
    project.status === "bible" ||
    !project.characterBible ||
    !project.spreads.length
  ) {
    const preferredLocationFixtures = await getStoryLocationFixtures({
      story: context.story,
      userId: project.userId,
    });

    const [characterBible, locationBible] = await Promise.all([
      generateCharacterBible({
        profile: context.profile,
        story: context.story,
        characters: context.characters,
        storyPeople: context.storyPeople,
      }),
      // Reuse a location bible the parent already prepared (with their notes and
      // reference photos) so their ground-truth is not discarded; only generate
      // one when none exists yet.
      project.locationBible?.locations.length
        ? Promise.resolve(
            applyPreferredFixturesToLocationBible(
              project.locationBible,
              preferredLocationFixtures
            )
          )
        : generateLocationBible({
            story: context.story,
            preferredFixtures: preferredLocationFixtures,
          }).catch((err) => {
            // A missing location bible degrades to today's behaviour; never fail
            // the whole build over the continuity enhancement.
            console.warn(
              `Location bible generation failed (${
                err instanceof Error ? err.message : "unknown error"
              }) - continuing without it.`
            );
            return undefined;
          }),
    ]);

    // Give each location a canonical establishing image so every spread set
    // there anchors to the same room layout and object orientation. Runs once,
    // before any spread is drawn; failures are non-fatal (fall back to text).
    const locationBibleWithEstablishing =
      await generateLocationEstablishingImages({
        project,
        locationBible,
      });

    const spreads = composePrintBookSpreads({
      bookProjectId: project.id,
      story: context.story,
      profile: context.profile,
      ageBand: project.ageBand,
      beats: project.beats,
      characterBible,
      locationBible: locationBibleWithEstablishing,
    });

    return db.bookProjects.update(project.id, {
      status: "illustrating",
      currentStageLabel: getBookProjectStageLabel("illustrating"),
      characterBible,
      locationBible: locationBibleWithEstablishing,
      spreads,
      completedSpreads: 0,
      totalSpreads: spreads.length,
      assets: {
        ...project.assets,
        lastBuildMode: "full",
        referenceSnapshotKey: context.referenceSnapshotKey,
        referenceImageCount: context.visualReferences.length,
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
      visualReferences: context.visualReferences,
      referenceSnapshotKey: context.referenceSnapshotKey,
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

async function advanceArtBuild(project: BookProject, context: BuildContext) {
  if (!project.characterBible || !project.spreads.length) {
    throw new Error(
      "This book does not have a complete draft to illustrate yet."
    );
  }

  const characterBible = enrichCharacterBibleWithLockedRules(
    project.characterBible,
    {
      profile: context.profile,
      storyPeople: context.storyPeople,
    }
  );

  if (project.status === "illustrating") {
    return regenerateProjectArt({
      id: project.id,
      project,
      story: context.story,
      profile: context.profile,
      characterBible,
      visualReferences: context.visualReferences,
      referenceSnapshotKey: context.referenceSnapshotKey,
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
  context: BuildContext,
  mode: "exports" | "finalize"
) {
  if (!project.spreads.length || !project.assets.coverImageUrl) {
    throw new Error("This book does not have a complete draft to refresh yet.");
  }

  const projectForExport: BookProject = {
    ...project,
    spreads: clearResolvedGeneratedPageImageErrors(project.spreads),
  };

  return finalizeProjectExports({
    id: project.id,
    project: projectForExport,
    story: context.story,
    profile: context.profile,
    buildMode: mode,
  });
}
function getSpreadImageJobId(spread: BookSpread, side: "left" | "right") {
  return side === "left" ? spread.leftPageImageJobId : spread.rightPageImageJobId;
}

function withSpreadImageGenerationStatus(
  spread: BookSpread,
  input: {
    side: "left" | "right";
    status?: BookSpread["leftPageImageStatus"];
    jobId?: string;
    attemptKey?: string;
    error?: string;
    generated?: Awaited<ReturnType<typeof generateSpreadPageIllustration>>;
    clearJob?: boolean;
  }
): BookSpread {
  const updatedAt = getNowIso();
  if (input.side === "left") {
    return {
      ...spread,
      leftPageImageUrl: input.generated?.url ?? spread.leftPageImageUrl,
      leftPageWebImageUrl: input.generated?.webUrl ?? spread.leftPageWebImageUrl,
      thumbnailUrl: input.generated
        ? input.generated.webUrl ?? input.generated.url
        : spread.thumbnailUrl,
      leftPageImageError: input.error,
      leftPageImageStatus: input.status,
      leftPageImageJobId: input.clearJob ? undefined : input.jobId,
      leftPageImageAttemptKey: input.attemptKey ?? spread.leftPageImageAttemptKey,
      leftPageImageUpdatedAt: updatedAt,
      leftPageQa: input.generated?.qa ?? spread.leftPageQa,
    };
  }
  return {
    ...spread,
    rightPageImageUrl: input.generated?.url ?? spread.rightPageImageUrl,
    rightPageImageError: input.error,
    rightPageImageStatus: input.status,
    rightPageImageJobId: input.clearJob ? undefined : input.jobId,
    rightPageImageAttemptKey: input.attemptKey ?? spread.rightPageImageAttemptKey,
    rightPageImageUpdatedAt: updatedAt,
    rightPageQa: input.generated?.qa ?? spread.rightPageQa,
  };
}



export async function regenerateBookSpreadPageImage(input: {
  projectId: string;
  userId: string;
  spreadId: string;
  side: "left" | "right";
  correctionNote?: string;
  jobId?: string;
  attemptKey?: string;
}) {
  const project = await db.bookProjects.getById(input.projectId);
  if (!project || project.userId !== input.userId) {
    throw new Error("Book project not found");
  }

  if (project.assets.activeJobStatus) {
    throw new Error("A build is already running for this book.");
  }

  if (!project.characterBible || !project.spreads.length) {
    throw new Error("This book does not have a complete draft to edit yet.");
  }

  if (!isGeneratedIllustrationConfigured()) {
    throw new Error(
      "Final art generation needs provider credentials plus blob storage before it can run."
    );
  }

  const spread = project.spreads.find((item) => item.id === input.spreadId);
  if (
    !spread ||
    spread.title === "Cover" ||
    spread.title === "Title" ||
    spread.title === "Back Cover"
  ) {
    throw new Error("Spread image not found.");
  }
  if (input.jobId && getSpreadImageJobId(spread, input.side) !== input.jobId) {
    return project;
  }

  const oldUrls =
    input.side === "left"
      ? [spread.leftPageImageUrl, spread.leftPageWebImageUrl, spread.thumbnailUrl]
      : [spread.rightPageImageUrl];
  const context = await loadBuildContext(project);
  const characterBible = enrichCharacterBibleWithLockedRules(
    project.characterBible,
    {
      profile: context.profile,
      storyPeople: context.storyPeople,
    }
  );
  let generated: Awaited<ReturnType<typeof generateSpreadPageIllustration>>;
  try {
    generated = await generateSpreadPageIllustration({
      project,
      story: context.story,
      profile: context.profile,
      characterBible,
      visualReferences: context.visualReferences,
      referenceSnapshotKey: context.referenceSnapshotKey,
      spread,
      side: input.side,
      correctionNote: input.correctionNote,
    });
  } catch (err) {
    const latestProject = (await db.bookProjects.getById(project.id)) ?? project;
    const latestSpread =
      latestProject.spreads.find((item) => item.id === input.spreadId) ?? spread;
    if (input.jobId && getSpreadImageJobId(latestSpread, input.side) !== input.jobId) {
      return latestProject;
    }
    const message = err instanceof Error ? err.message : "Image generation failed.";
    const failedSpread = withSpreadImageGenerationStatus(latestSpread, {
      side: input.side,
      status: "failed",
      jobId: input.jobId,
      attemptKey: input.attemptKey,
      error: message,
      clearJob: true,
    });
    const failedImagePatch =
      latestProject.status === "failed"
        ? {
            status: "failed" as const,
            currentStageLabel: "One or more images need to be retried.",
            errorCode: "illustrating:image_failed",
            errorMessage:
              "One or more images failed to generate. Retry only the failed image from the spread review.",
          }
        : {};
    await db.bookProjects.update(project.id, {
      ...failedImagePatch,
      characterBible,
      spreads: applySpreadIllustration(latestProject.spreads, failedSpread),
    });
    await logEvent({
      error: err,
      code: err instanceof AppError ? err.code : undefined,
      fallbackCode: "book.illustration_failed",
      userId: project.userId,
      entityType: "book",
      entityId: project.id,
      source: "book/image-regenerate",
      context: { spreadId: spread.id, side: input.side, jobId: input.jobId },
    });
    throw err;
  }

  const latestProject = (await db.bookProjects.getById(project.id)) ?? project;
  const latestSpread =
    latestProject.spreads.find((item) => item.id === input.spreadId) ?? spread;
  if (input.jobId && getSpreadImageJobId(latestSpread, input.side) !== input.jobId) {
    await deleteBookAssetUrls([generated.url, generated.webUrl].filter(Boolean) as string[]).catch(
      () => 0
    );
    return latestProject;
  }

  const nextSpread = withSpreadImageGenerationStatus(latestSpread, {
    side: input.side,
    status: "running",
    jobId: input.jobId,
    attemptKey: input.attemptKey,
    generated,
  });
  const nextSpreads = applySpreadIllustration(latestProject.spreads, nextSpread);
  const updatedProject = await db.bookProjects.update(project.id, {
    status: "composing",
    currentStageLabel: "Refreshing exports with the regenerated image...",
    errorCode: undefined,
    errorMessage: undefined,
    characterBible,
    spreads: nextSpreads,
    assets: {
      ...latestProject.assets,
      artMode:
        generated.provider === "placeholder"
          ? "mixed"
          : (latestProject.assets.artMode ?? "generated"),
      lastBuildMode: "exports",
    },
  });

  if (!updatedProject) throw new Error("Book project not found");

  await deleteBookAssetUrls(
    oldUrls.filter((url): url is string => Boolean(url) && url !== generated.url && url !== generated.webUrl)
  ).catch(() => 0);

  if (hasUnresolvedGeneratedPageImages(updatedProject.spreads)) {
    const failedProject = await db.bookProjects.update(project.id, {
      status: "failed",
      currentStageLabel: "One or more images need to be retried.",
      errorCode: "illustrating:image_failed",
      errorMessage:
        "One or more images failed to generate. Retry only the failed image from the spread review.",
    });
    if (!failedProject) throw new Error("Book project not found");
    return failedProject;
  }

  const finalizedProject = await finalizeProjectExports({
    id: project.id,
    project: updatedProject,
    story: context.story,
    profile: context.profile,
    buildMode: "exports",
  });
  if (!finalizedProject || !input.jobId) return finalizedProject;

  const finalSpread = finalizedProject.spreads.find(
    (item) => item.id === input.spreadId
  );
  if (!finalSpread || getSpreadImageJobId(finalSpread, input.side) !== input.jobId) {
    return finalizedProject;
  }
  const readySpread = withSpreadImageGenerationStatus(finalSpread, {
    side: input.side,
    status: "ready",
    attemptKey: input.attemptKey,
    error: undefined,
    clearJob: true,
  });
  return db.bookProjects.update(project.id, {
    spreads: applySpreadIllustration(finalizedProject.spreads, readySpread),
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
    scheduleBookBuildJobContinuation(jobId);
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
    input.mode === "full"
      ? await reserveIllustratedBookCredits(input.project)
      : input.mode === "art"
        ? await reserveIllustratedBookCredits(input.project, true)
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

  const effectiveProjectStatus = getEffectiveBookProjectStatus(billableProject);
  const updatedProject = await db.bookProjects.update(billableProject.id, {
    status:
      input.mode === "full"
        ? "queued"
        : input.mode === "art"
          ? "illustrating"
          : input.mode === "finalize"
            ? "proofing"
            : input.mode === "exports"
              ? effectiveProjectStatus
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
      const emailProject = finalProject ?? nextProject;

      if (
        shouldSendBookReadyEmail({
          mode: runningJob.mode,
          project: emailProject,
        })
      ) {
        const bookReadyEmailSentAt = getNowIso();
        const claimedProject = await db.bookProjects.claimReadyEmail(
          project.id,
          bookReadyEmailSentAt
        );
        if (!claimedProject) {
          return {
            job: updatedJob,
            project: finalProject ?? nextProject,
            shouldContinue: !terminalProject,
          };
        }
        finalProject = claimedProject;

        // Fire-and-forget - email failure must never break the build.
        after(async () => {
          try {
            const { clerkClient } = await import("@clerk/nextjs/server");
            const clerk = await clerkClient();
            const user = await clerk.users.getUser(job.userId);
            const email = user.emailAddresses.find(
              (e) => e.id === user.primaryEmailAddressId
            )?.emailAddress;
            const firstName = user.firstName ?? context.profile.name ?? "there";
            const appUrl =
              runningJob.baseUrl ??
              process.env.NEXT_PUBLIC_APP_URL ??
              "https://storycot.com.au";
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
    }

    return {
      job: updatedJob,
      project: finalProject ?? nextProject,
      shouldContinue: !terminalProject,
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

    if (runningJob.mode === "finalize" || runningJob.mode === "exports") {
      await markExportJobFailure(project, job.id, failureCode, message, error);
    } else {
      await markJobProjectFailure(project, job.id, failureCode, message, error);
    }
    throw error;
  }
}
