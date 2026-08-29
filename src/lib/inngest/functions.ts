import type { InngestFunction } from "inngest";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";
import { db } from "@/lib/db";
import { processBookBuildJob } from "@/lib/print-books/jobs";
import {
  processLocationEstablishingJob,
  type LocationEstablishingJobData,
} from "@/lib/print-books/locationEstablishingJobs";
import {
  processAvatarGenerationJob,
  type AvatarGenerationJobData,
} from "@/lib/avatarGenerationJobs";
import {
  processBookImageRegenerationJob,
  type BookImageRegenerationJobData,
} from "@/lib/bookImageRegenerationJobs";

// Hard stop so a wedged pipeline can never loop forever inside one invocation.
// A full 16-spread build advances well under this many stages.
const MAX_ADVANCE_STEPS = 80;

export async function advanceBookBuildEventStep(jobId: string) {
  const queuedJob = await db.bookBuildJobs.getById(jobId);
  if (!queuedJob) {
    return { shouldContinue: false, status: "missing-job" };
  }

  try {
    const { job, shouldContinue } = await processBookBuildJob(jobId);
    return { shouldContinue, status: job.status };
  } catch (error) {
    if (error instanceof Error && error.message === "Job not found") {
      return { shouldContinue: false, status: "missing-job" };
    }
    throw error;
  }
}

/**
 * Durable book-build pipeline.
 *
 * Replaces the fragile Next.js `after()` self-continuation chain: Inngest owns
 * durability, retries and - crucially - a global concurrency cap so we stop
 * multiple simultaneous builds from stampeding OpenAI's image rate limit.
 *
 * It reuses the existing stage machine (`processBookBuildJob`), advancing one
 * stage per durable step until the job reaches a terminal state.
 *
 * Generated art uses the OpenAI Batch API. Inngest polls the batch between
 * durable steps instead of holding a request open while OpenAI processes images.
 */
export const buildBook = inngest.createFunction(
  {
    id: "build-book",
    concurrency: [
      // Max 3 builds running globally at once (keeps OpenAI RPM headroom).
      { limit: 3 },
      // Max 1 build per user so no single account can hog the queue.
      { limit: 1, key: "event.data.userId" },
    ],
    retries: 3,
    triggers: [{ event: INNGEST_EVENTS.bookBuildRequested }],
  },
  async ({ event, step }) => {
    const { jobId } = event.data as { jobId: string };

    for (let i = 0; i < MAX_ADVANCE_STEPS; i += 1) {
      const result = await step.run(`advance-${i}`, async () => {
        return advanceBookBuildEventStep(jobId);
      });

      if (!result.shouldContinue) {
        return { jobId, status: result.status, steps: i + 1 };
      }
    }

    return {
      jobId,
      status: "incomplete",
      reason: "max-advance-steps",
      steps: MAX_ADVANCE_STEPS,
    };
  }
);

export const generateLocationEstablishing = inngest.createFunction(
  {
    id: "generate-location-establishing",
    concurrency: [{ limit: 4 }, { limit: 1, key: "event.data.userId" }],
    retries: 1,
    triggers: [{ event: INNGEST_EVENTS.locationEstablishingRequested }],
  },
  async ({ event, step }) => {
    const data = event.data as LocationEstablishingJobData;
    return step.run("generate-location-establishing", async () => {
      return processLocationEstablishingJob(data);
    });
  }
);

export const generateAvatarReference = inngest.createFunction(
  {
    id: "generate-avatar-reference",
    concurrency: [{ limit: 4 }, { limit: 1, key: "event.data.userId" }],
    retries: 2,
    triggers: [{ event: INNGEST_EVENTS.avatarGenerationRequested }],
  },
  async ({ event, step }) => {
    const data = event.data as AvatarGenerationJobData;
    return step.run("generate-avatar-reference", async () => {
      return processAvatarGenerationJob(data);
    });
  }
);
export const regenerateBookImage = inngest.createFunction(
  {
    id: "regenerate-book-image",
    concurrency: [{ limit: 4 }, { limit: 1, key: "event.data.userId" }],
    retries: 2,
    triggers: [{ event: INNGEST_EVENTS.bookImageRegenerationRequested }],
  },
  async ({ event, step }) => {
    const data = event.data as BookImageRegenerationJobData;
    return step.run("regenerate-book-image", async () => {
      return processBookImageRegenerationJob(data);
    });
  }
);

/**
 * Durable story-generation fallback.
 *
 * The live SSE route generates connected stories directly for the best UX. This
 * function guarantees a story still finishes (and the credit is charged exactly
 * once) even if the browser closed mid-generation. After a short grace period it
 * polls: while a live generator keeps its claim fresh (via heartbeat) it waits;
 * once the claim goes stale (the live path crashed) or the story is abandoned,
 * it takes over and generates. A healthy live run is therefore never duplicated.
 */
export const generateStory = inngest.createFunction(
  {
    id: "generate-story",
    concurrency: [{ limit: 5 }, { limit: 1, key: "event.data.userId" }],
    retries: 3,
    triggers: [{ event: INNGEST_EVENTS.storyGenerationRequested }],
  },
  async ({ event, step }) => {
    const { storyId, locale } = event.data as {
      storyId: string;
      userId?: string;
      locale?: string;
    };
    const jobId = `inngest:${event.id ?? storyId}`;

    // Grace period: give the connected browser's live generation time to start
    // and claim before the durable fallback begins polling.
    await step.sleep("await-live-generation", "30s");

    // Poll until the story reaches a terminal state or its claim goes stale
    // (i.e. the live generator crashed and stopped heartbeating). Each attempt
    // is its own durable step so a healthy live run is never generated twice.
    const MAX_POLLS = 20;
    for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
      const outcome = await step.run(`attempt-${attempt}`, async () => {
        const { db } = await import("@/lib/db");
        const { runStoryGeneration, GENERATION_CLAIM_STALE_MS } = await import(
          "@/lib/stories/runGeneration"
        );

        const story = await db.stories.getById(storyId);
        if (!story) return { action: "done" as const, status: "missing" };
        if (story.status !== "generating") {
          return { action: "done" as const, status: story.status };
        }

        const now = new Date();
        const staleBefore = new Date(
          now.getTime() - GENERATION_CLAIM_STALE_MS
        ).toISOString();
        const claimed = await db.stories.claimGeneration(
          storyId,
          jobId,
          now.toISOString(),
          staleBefore
        );
        if (!claimed) {
          // A live generator still holds a fresh claim; wait and re-check.
          return { action: "wait" as const, status: "claimed-elsewhere" };
        }

        const result = await runStoryGeneration(storyId, { locale, jobId });
        return { action: "done" as const, status: result.status };
      });

      if (outcome.action === "done") {
        return { storyId, status: outcome.status };
      }
      await step.sleep(`poll-wait-${attempt}`, "30s");
    }

    return { storyId, status: "gave-up" };
  }
);

/**
 * Durable public print-order fulfillment.
 *
 * The Stripe webhook records the paid order (with shipping) and enqueues this,
 * instead of calling Lulu inline. That keeps the webhook fast and lets a
 * transient Lulu failure retry with backoff rather than stranding a paid order
 * for manual resend. Idempotent: an order already submitted is skipped, so
 * Stripe redelivery or Inngest retries never double-print.
 */
export const submitPrintFulfillmentJob = inngest.createFunction(
  {
    id: "submit-print-fulfillment",
    concurrency: [{ limit: 5 }],
    retries: 5,
    triggers: [{ event: INNGEST_EVENTS.printFulfillmentRequested }],
  },
  async ({ event, step }) => {
    const data = event.data as
      | { kind: "public"; orderId: string }
      | { kind: "owner"; projectId: string };
    return step.run("submit-print-fulfillment", async () => {
      const { runPublicPrintFulfillment, runOwnerPrintFulfillment } =
        await import("@/lib/print-books/runFulfillment");
      const result =
        data.kind === "owner"
          ? await runOwnerPrintFulfillment(data.projectId)
          : await runPublicPrintFulfillment(data.orderId);
      // Surface a real failure so Inngest retries the transient Lulu error.
      if (result.status === "failed") {
        throw new Error(result.reason ?? "Lulu fulfillment failed");
      }
      return { ...data, status: result.status };
    });
  }
);

// Runs on the 2nd of every month at 02:00 UTC (well after month rollover).
// Awards top-3 voted public stories that haven't won in a previous month.
// Idempotent — safe if Inngest retries; the award route skips already-run months.
export const awardMonthlyPublicStoryWinners = inngest.createFunction(
  {
    id: "award-monthly-public-story-winners",
    retries: 3,
    triggers: [{ cron: "0 2 2 * *" }],
  },
  async ({ step }) => {
    return step.run("award-winners", async () => {
      const { adjustUserCredits } = await import("@/lib/credits");
      const { PUBLIC_STORY_REWARD_TIERS } = await import(
        "@/lib/publicStoryRewards"
      );
      const { db } = await import("@/lib/db");

      const voteMonth = db.publicStoryVotes.getVoteMonth();

      // Idempotency: bail if this month already ran.
      const existing =
        await db.publicStoryModerationEvents.listRewardEventsForMonth(
          voteMonth
        );
      if (existing.length > 0) {
        return { voteMonth, status: "already_run", awarded: [] };
      }

      const previouslyRewardedIds =
        await db.publicStoryModerationEvents.listAllRewardedStoryIds();
      const leaderboard = await db.publicStoryVotes.leaderboard(50);
      const eligible = leaderboard.filter(
        (e) => e.votes > 0 && !previouslyRewardedIds.has(e.story.id)
      );

      const awarded: Array<{
        place: number;
        storyId: string;
        userId: string;
        credits: number;
      }> = [];
      const usedUserIds = new Set<string>();

      for (const tier of PUBLIC_STORY_REWARD_TIERS) {
        const winner = eligible.find((e) => !usedUserIds.has(e.story.userId));
        if (!winner) continue;
        eligible.splice(eligible.indexOf(winner), 1);
        usedUserIds.add(winner.story.userId);

        const newBalance = await adjustUserCredits(
          winner.story.userId,
          tier.credits
        );
        await db.publicStoryModerationEvents.create({
          storyId: winner.story.id,
          actorUserId: "inngest-cron",
          actorLabel: "Monthly rewards cron",
          action: "reward_granted",
          note: `${tier.label}: ${tier.credits} credit reward for ${voteMonth} (automated).`,
          metadata: {
            voteMonth,
            place: tier.place,
            placeLabel: tier.label,
            credits: tier.credits,
            votes: winner.votes,
            userId: winner.story.userId,
            newBalance,
          },
        });

        awarded.push({
          place: tier.place,
          storyId: winner.story.id,
          userId: winner.story.userId,
          credits: tier.credits,
        });
      }

      return { voteMonth, status: "completed", awarded };
    });
  }
);

export const inngestFunctions: InngestFunction.Any[] = [
  buildBook,
  generateLocationEstablishing,
  generateAvatarReference,
  regenerateBookImage,
  generateStory,
  submitPrintFulfillmentJob,
  awardMonthlyPublicStoryWinners,
];
