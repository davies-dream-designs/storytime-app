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

export const inngestFunctions: InngestFunction.Any[] = [
  buildBook,
  generateLocationEstablishing,
];
