import type { InngestFunction } from "inngest";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";
import { processBookBuildJob } from "@/lib/print-books/jobs";
import { db } from "@/lib/db";
import {
  buildKlingMotionPrompt,
  getIllustratedSpreads,
  prepareVideoSourceImage,
  extractLastFrame,
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

// After submitting to Kling, sleep then check if the webhook already wrote
// the video URL to the DB. If not, poll fal.ai directly as fallback.
const KLING_INITIAL_SLEEP_MS = 45_000;
const KLING_POLL_RETRIES = 4;
const KLING_POLL_INTERVAL_MS = 20_000;

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

    // frameUrl starts as null. After each clip, we extract its last frame
    // and use it as the input for the next clip — this chains the character
    // appearance through the whole video so it's consistent rather than
    // re-derived from each flat illustration independently.
    let frameUrl: string | null = null;

    for (let i = 0; i < spreads.length; i++) {
      const spread = spreads[i]!;
      const prompt = buildKlingMotionPrompt(spread, project.characterBible);

      // First spread: resize the illustration to 1024px as the base input.
      // Subsequent spreads: use the last frame of the previous clip.
      let sourceUrl: string;
      if (frameUrl) {
        sourceUrl = frameUrl;
      } else {
        sourceUrl = await step.run(`prep-image-${i}`, (): Promise<string> =>
          prepareVideoSourceImage(projectId, spread.id, spread.leftPageImageUrl!)
        );
      }

      // Build the webhook URL — fal.ai calls this when the job completes.
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ??
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      const webhookUrl = `${appUrl}/api/webhooks/fal`;

      // Submit to Kling with webhook URL + KV mapping so the webhook handler
      // can write the video URL directly to the DB.
      const requestId: string = await step.run(`submit-spread-${i}`, (): Promise<string> =>
        submitKlingJob(sourceUrl, prompt, webhookUrl, projectId, spread.id)
      );

      // Sleep then check if the webhook already wrote the video URL to the DB.
      // This is simpler and more reliable than step.waitForEvent with an if
      // condition, which has timing/timeout bugs with Inngest's event matching.
      await step.sleep(`wait-spread-${i}`, KLING_INITIAL_SLEEP_MS);

      let videoUrl: string | undefined;

      // Check DB first — webhook may have already written the URL.
      const afterSleep = await step.run(`check-db-${i}`, async (): Promise<string | null> => {
        const current = await db.bookProjects.getById(projectId);
        const s = current?.spreads.find((sp) => sp.id === spread.id);
        return s?.leftPageVideoUrl ?? null;
      });

      if (afterSleep) {
        videoUrl = afterSleep;
        results.push({ spreadId: spread.id, videoUrl });
      } else {
        // Webhook hasn't arrived yet — poll fal.ai directly.
        for (let p = 0; p < KLING_POLL_RETRIES; p++) {
          const poll = await step.run(
            `poll-spread-${i}-${p}`,
            (): Promise<{ done: boolean; videoUrl?: string; failed?: boolean; error?: string }> =>
              pollKlingJob(requestId)
          );
          if (poll.done) {
            if (!poll.failed && poll.videoUrl) {
              videoUrl = poll.videoUrl;
              results.push({ spreadId: spread.id, videoUrl });
            } else {
              results.push({ spreadId: spread.id, error: poll.error ?? "Kling failed" });
              console.warn(`Spread ${i} poll failed: ${poll.error}`);
            }
            break;
          }
          if (p < KLING_POLL_RETRIES - 1) {
            await step.sleep(`poll-wait-${i}-${p}`, KLING_POLL_INTERVAL_MS);
          }
        }
        if (!videoUrl && !results.find((r) => r.spreadId === spread.id)) {
          results.push({ spreadId: spread.id, error: "Kling did not complete in time" });
        }
      }

      // Persist the video URL onto the spread (webhook may not have written it yet
      // if we got it via the fallback poll path).
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

        // Extract last frame to use as input for the next clip
        try {
          frameUrl = await step.run(`extract-frame-${i}`, () =>
            extractLastFrame(videoUrl, projectId, spread.id)
          );
        } catch (err) {
          // Frame extraction failure is non-fatal — next clip falls back to
          // the illustration image rather than breaking the whole pipeline.
          console.warn(`Frame extraction failed for spread ${i}:`, err);
          frameUrl = null;
        }
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
