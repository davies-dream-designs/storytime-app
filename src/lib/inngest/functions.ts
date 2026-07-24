import type { InngestFunction } from "inngest";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";
import { processBookBuildJob } from "@/lib/print-books/jobs";
import { db } from "@/lib/db";
import {
  buildKlingMotionPrompt,
  getIllustratedSpreads,
  prepareVideoSourceImage,
  submitKlingJob,
  pollKlingJob,
} from "@/lib/print-books/video";

// Hard stop so a wedged pipeline can never loop forever inside one invocation.
// A full 16-spread build advances well under this many stages.
const MAX_ADVANCE_STEPS = 80;

/**
 * Durable book-build pipeline.
 *
 * Replaces the fragile Next.js `after()` self-continuation chain: Inngest owns
 * durability, retries and — crucially — a global concurrency cap so we stop
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
    // Keep one build active while Batch API polling is new; this can be raised
    // once production behavior is understood.
    concurrency: { limit: 1 },
    retries: 3,
    triggers: [{ event: INNGEST_EVENTS.bookBuildRequested }],
  },
  async ({ event, step }) => {
    const { jobId } = event.data as { jobId: string };

    for (let i = 0; i < MAX_ADVANCE_STEPS; i += 1) {
      const result = await step.run(`advance-${i}`, async () => {
        const { job, shouldContinue, waitMs } =
          await processBookBuildJob(jobId);
        return { shouldContinue, status: job.status, waitMs };
      });

      if (!result.shouldContinue) {
        return { jobId, status: result.status, steps: i + 1 };
      }

      if (result.waitMs) {
        await step.sleep(`wait-${i}`, result.waitMs);
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

// ---------------------------------------------------------------------------
// Animated storybook video generation
// ---------------------------------------------------------------------------

// Processes one spread at a time: submit → sleep → poll → store.
// Kling jobs take ~60-90s. We sleep 70s then poll with up to 3 retries
// before giving up on a single spread (the rest still complete).
const KLING_SLEEP_MS = 70_000;
const KLING_POLL_RETRIES = 6;
const KLING_POLL_INTERVAL_MS = 15_000;

export const generateBookVideo = inngest.createFunction(
  {
    id: "generate-book-video",
    concurrency: { limit: 2 },
    retries: 0,
    triggers: [{ event: INNGEST_EVENTS.bookVideoRequested }],
  },
  async ({ event, step }) => {
    const { projectId } = event.data as { projectId: string };

    const project = await step.run("load-project", () =>
      db.bookProjects.getById(projectId)
    );
    if (!project) throw new Error(`Project ${projectId} not found`);
    if (!project.characterBible) throw new Error("No character bible on project");

    const spreads = getIllustratedSpreads(project.spreads);

    await step.run("mark-generating", () =>
      db.bookProjects.update(projectId, {
        assets: {
          ...project.assets,
          animatedVideoStatus: "generating",
          animatedVideoStartedAt: new Date().toISOString(),
        },
      })
    );

    const results: { spreadId: string; videoUrl?: string; error?: string }[] = [];

    for (let i = 0; i < spreads.length; i++) {
      const spread = spreads[i]!;
      const prompt = buildKlingMotionPrompt(spread, project.characterBible);

      // Resize the 2490px print-quality image down to 1024px JPEG for Kling.
      // Kling outputs 960px regardless of input — feeding it 16MB buys nothing.
      const sourceUrl = await step.run(`prep-image-${i}`, () =>
        prepareVideoSourceImage(projectId, spread.id, spread.leftPageImageUrl!)
      );

      // Submit the Kling job
      const requestId = await step.run(`submit-spread-${i}`, () =>
        submitKlingJob(sourceUrl, prompt)
      );

      // Sleep while Kling processes
      await step.sleep(`wait-spread-${i}`, KLING_SLEEP_MS);

      // Poll until done or give up
      let videoUrl: string | undefined;
      let pollError: string | undefined;

      for (let p = 0; p < KLING_POLL_RETRIES; p++) {
        const pollResult = await step.run(`poll-spread-${i}-attempt-${p}`, () =>
          pollKlingJob(requestId)
        );

        if (pollResult.done) {
          if (pollResult.failed) {
            pollError = pollResult.error ?? "Kling failed";
          } else {
            videoUrl = pollResult.videoUrl;
          }
          break;
        }

        if (p < KLING_POLL_RETRIES - 1) {
          await step.sleep(`retry-wait-${i}-${p}`, KLING_POLL_INTERVAL_MS);
        }
      }

      if (!pollError) {
        results.push({ spreadId: spread.id, videoUrl });
      } else {
        results.push({ spreadId: spread.id, error: pollError });
        console.warn(`Spread ${spread.id} video failed: ${pollError}`);
      }

      // Persist the video URL onto the spread immediately
      if (videoUrl) {
        const freshProject = await step.run(`store-spread-${i}`, async () => {
          const current = await db.bookProjects.getById(projectId);
          if (!current) return null;
          const updatedSpreads = current.spreads.map((s) =>
            s.id === spread.id ? { ...s, leftPageVideoUrl: videoUrl } : s
          );
          return db.bookProjects.update(projectId, { spreads: updatedSpreads });
        });
        if (!freshProject) break;
      }
    }

    const allFailed = results.every((r) => r.error);
    const anySucceeded = results.some((r) => r.videoUrl);

    await step.run("mark-complete", async () => {
      const current = await db.bookProjects.getById(projectId);
      if (!current) return;
      return db.bookProjects.update(projectId, {
        assets: {
          ...current.assets,
          animatedVideoStatus: allFailed ? "failed" : "ready",
          animatedVideoReadyAt: allFailed ? undefined : new Date().toISOString(),
          animatedVideoError: allFailed ? "All spreads failed to generate" : undefined,
        },
      });
    });

    return { projectId, total: spreads.length, succeeded: anySucceeded ? results.filter((r) => r.videoUrl).length : 0 };
  }
);

export const inngestFunctions: InngestFunction.Any[] = [buildBook, generateBookVideo];
