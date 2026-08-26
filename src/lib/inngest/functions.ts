import type { InngestFunction } from "inngest";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";
import { db } from "@/lib/db";
import { processBookBuildJob } from "@/lib/print-books/jobs";
import {
  processLocationEstablishingJob,
  type LocationEstablishingJobData,
} from "@/lib/print-books/locationEstablishingJobs";

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

/**
 * Durable story-generation fallback.
 *
 * The live SSE route generates connected stories directly for the best UX. This
 * function guarantees a story still finishes (and the credit is charged exactly
 * once) even if the browser closed mid-generation. It waits briefly to let the
 * live path complete, then only takes over if the story is still generating and
 * hasn't been freshly claimed by a live generator.
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

    // Grace period: give the connected browser's live generation time to finish
    // before the durable fallback considers taking over.
    await step.sleep("await-live-generation", "60s");

    return step.run("generate-story", async () => {
      const { db } = await import("@/lib/db");
      const { runStoryGeneration } = await import(
        "@/lib/stories/runGeneration"
      );

      const story = await db.stories.getById(storyId);
      if (!story || story.status !== "generating") {
        return { storyId, status: story?.status ?? "missing" };
      }

      // Consider a live claim stale after 2 minutes; a healthy live generator
      // refreshes far more often than that via its own claim at request start.
      const now = new Date();
      const staleBefore = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
      const claimed = await db.stories.claimGeneration(
        storyId,
        `inngest:${event.id ?? storyId}`,
        now.toISOString(),
        staleBefore
      );
      if (!claimed) {
        return { storyId, status: "claimed-elsewhere" };
      }

      const result = await runStoryGeneration(storyId, { locale });
      return { storyId, status: result.status };
    });
  }
);

export const inngestFunctions: InngestFunction.Any[] = [
  buildBook,
  generateLocationEstablishing,
  generateStory,
];
