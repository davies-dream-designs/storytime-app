import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { assertImageRegenerationAffordable, captureIllustratedBookCredits, chargeImageRegenerationCredit, refundIllustratedBookCredits, reserveIllustratedBookCredits } from "@/lib/credits";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";
import { logEvent } from "@/lib/logEvent";
import { regenerateBookSpreadPageImage } from "@/lib/print-books/jobs";
import { applySpreadIllustration } from "@/lib/print-books/illustrations";
import type { BookProject, BookSpread } from "@/types/printBook";

export type BookImageRegenerationJobData = {
  jobId: string;
  userId: string;
  projectId: string;
  spreadId: string;
  side: "left" | "right";
  correctionNote?: string;
  attemptKey: string;
  shouldChargeRedo: boolean;
  reservedBookCharge: boolean;
};

export type BookImageRegenerationEnqueueResult = {
  jobId: string;
  status: "queued" | "running";
  attemptKey: string;
  existing: boolean;
};

function sanitizeAttemptKey(value?: string | null) {
  const cleaned = value?.trim().slice(0, 160);
  return cleaned || randomUUID();
}

function isPlaceholderImageUrl(url?: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.startsWith("data:image/svg") || lower.endsWith(".svg");
}

function getSideStatus(spread: BookSpread, side: "left" | "right") {
  return side === "left" ? spread.leftPageImageStatus : spread.rightPageImageStatus;
}

function getSideJobId(spread: BookSpread, side: "left" | "right") {
  return side === "left" ? spread.leftPageImageJobId : spread.rightPageImageJobId;
}

function getSideAttemptKey(spread: BookSpread, side: "left" | "right") {
  return side === "left"
    ? spread.leftPageImageAttemptKey
    : spread.rightPageImageAttemptKey;
}

function getSideUrl(spread: BookSpread, side: "left" | "right") {
  return side === "left"
    ? spread.leftPageImageUrl ?? spread.imageUrl
    : spread.rightPageImageUrl ?? spread.imageUrl;
}

function getSideError(spread: BookSpread, side: "left" | "right") {
  return side === "left" ? spread.leftPageImageError : spread.rightPageImageError;
}

function isActiveStatus(status?: string) {
  return status === "queued" || status === "running";
}

function withSideStatus(
  spread: BookSpread,
  input: {
    side: "left" | "right";
    status?: BookSpread["leftPageImageStatus"];
    jobId?: string;
    attemptKey?: string;
    error?: string;
    clearJob?: boolean;
  }
): BookSpread {
  const updatedAt = new Date().toISOString();
  if (input.side === "left") {
    return {
      ...spread,
      leftPageImageStatus: input.status,
      leftPageImageJobId: input.clearJob ? undefined : input.jobId,
      leftPageImageAttemptKey: input.attemptKey ?? spread.leftPageImageAttemptKey,
      leftPageImageError: input.error,
      leftPageImageUpdatedAt: updatedAt,
    };
  }
  return {
    ...spread,
    rightPageImageStatus: input.status,
    rightPageImageJobId: input.clearJob ? undefined : input.jobId,
    rightPageImageAttemptKey: input.attemptKey ?? spread.rightPageImageAttemptKey,
    rightPageImageError: input.error,
    rightPageImageUpdatedAt: updatedAt,
  };
}

async function markSpreadSide(input: {
  projectId: string;
  userId: string;
  spreadId: string;
  side: "left" | "right";
  status?: BookSpread["leftPageImageStatus"];
  jobId?: string;
  attemptKey?: string;
  error?: string;
  clearJob?: boolean;
}) {
  const project = await db.bookProjects.getById(input.projectId);
  if (!project || project.userId !== input.userId) return undefined;
  const spread = project.spreads.find((item) => item.id === input.spreadId);
  if (!spread) return undefined;
  if (
    input.status !== "queued" &&
    input.jobId &&
    getSideJobId(spread, input.side) !== input.jobId
  ) {
    return undefined;
  }
  const nextSpread = withSideStatus(spread, input);
  return db.bookProjects.update(project.id, {
    spreads: applySpreadIllustration(project.spreads, nextSpread),
  });
}

export async function enqueueBookImageRegeneration(input: {
  project: BookProject;
  spreadId: string;
  side: "left" | "right";
  correctionNote?: string;
  attemptKey?: string | null;
}): Promise<BookImageRegenerationEnqueueResult> {
  const spread = input.project.spreads.find((item) => item.id === input.spreadId);
  if (!spread) throw new Error("Spread image not found.");
  const status = getSideStatus(spread, input.side);
  if (isActiveStatus(status)) {
    return {
      jobId: getSideJobId(spread, input.side) ?? getSideAttemptKey(spread, input.side) ?? input.spreadId,
      status: status as "queued" | "running",
      attemptKey: getSideAttemptKey(spread, input.side) ?? sanitizeAttemptKey(input.attemptKey),
      existing: true,
    };
  }

  const attemptKey = sanitizeAttemptKey(input.attemptKey);
  const currentUrl = getSideUrl(spread, input.side);
  const currentError = getSideError(spread, input.side);
  const isPaidRedo = Boolean(currentUrl) && !currentError && !isPlaceholderImageUrl(currentUrl);
  let billableProject = input.project;
  let reservedBookCharge = false;

  if (isPaidRedo) {
    await assertImageRegenerationAffordable(input.project.userId);
  } else if (
    input.project.billing?.status !== "reserved" &&
    input.project.billing?.status !== "captured"
  ) {
    billableProject = await reserveIllustratedBookCredits(input.project);
    reservedBookCharge = true;
  }

  const jobId = randomUUID();
  try {
    await markSpreadSide({
      projectId: billableProject.id,
      userId: billableProject.userId,
      spreadId: input.spreadId,
      side: input.side,
      status: "queued",
      jobId,
      attemptKey,
      error: undefined,
    });
    await inngest.send({
      name: INNGEST_EVENTS.bookImageRegenerationRequested,
      data: {
        jobId,
        userId: billableProject.userId,
        projectId: billableProject.id,
        spreadId: input.spreadId,
        side: input.side,
        correctionNote: input.correctionNote,
        attemptKey,
        shouldChargeRedo: isPaidRedo,
        reservedBookCharge,
      } satisfies BookImageRegenerationJobData,
    });
  } catch (err) {
    await markSpreadSide({
      projectId: billableProject.id,
      userId: billableProject.userId,
      spreadId: input.spreadId,
      side: input.side,
      status: "failed",
      jobId,
      attemptKey,
      error: "Could not start background image regeneration. Please try again.",
      clearJob: true,
    }).catch(() => undefined);
    if (reservedBookCharge) await refundIllustratedBookCredits(billableProject);
    throw err;
  }

  return { jobId, status: "queued", attemptKey, existing: false };
}

export async function processBookImageRegenerationJob(
  input: BookImageRegenerationJobData
): Promise<{ jobId: string; status: "ready" | "failed" | "stale" }> {
  let project: BookProject | undefined;
  try {
    await markSpreadSide({
      projectId: input.projectId,
      userId: input.userId,
      spreadId: input.spreadId,
      side: input.side,
      status: "running",
      jobId: input.jobId,
      attemptKey: input.attemptKey,
      error: undefined,
    });
    project = await regenerateBookSpreadPageImage({
      projectId: input.projectId,
      userId: input.userId,
      spreadId: input.spreadId,
      side: input.side,
      correctionNote: input.correctionNote,
      jobId: input.jobId,
      attemptKey: input.attemptKey,
    });
    if (!project) throw new Error("Book project not found");
    const spread = project.spreads.find((item) => item.id === input.spreadId);
    if (!spread || getSideAttemptKey(spread, input.side) !== input.attemptKey) {
      return { jobId: input.jobId, status: "stale" };
    }
    if (getSideStatus(spread, input.side) !== "ready") {
      return { jobId: input.jobId, status: "stale" };
    }

    if (input.shouldChargeRedo) {
      try {
        await chargeImageRegenerationCredit(input.userId);
      } catch (err) {
        await logEvent({
          error: err,
          code: "credits.post_charge_failed",
          userId: input.userId,
          entityType: "book",
          entityId: input.projectId,
          source: "books/images/regenerate",
          context: { jobId: input.jobId, spreadId: input.spreadId, side: input.side },
        });
      }
    }

    if (project.billing?.status === "reserved" && project.status === "ready") {
      await captureIllustratedBookCredits(project);
    }

    return { jobId: input.jobId, status: "ready" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image generation failed";
    await markSpreadSide({
      projectId: input.projectId,
      userId: input.userId,
      spreadId: input.spreadId,
      side: input.side,
      status: "failed",
      jobId: input.jobId,
      attemptKey: input.attemptKey,
      error: message,
      clearJob: true,
    }).catch(() => undefined);
    if (input.reservedBookCharge) {
      const latest = await db.bookProjects.getById(input.projectId).catch(() => undefined);
      if (latest?.billing?.status === "reserved") {
        await refundIllustratedBookCredits(latest).catch(() => undefined);
      }
    }
    await logEvent({
      error: err,
      fallbackCode: "book.illustration_failed",
      userId: input.userId,
      entityType: "book",
      entityId: input.projectId,
      source: "books/images/regenerate",
      context: { jobId: input.jobId, spreadId: input.spreadId, side: input.side },
    });
    return { jobId: input.jobId, status: "failed" };
  }
}
