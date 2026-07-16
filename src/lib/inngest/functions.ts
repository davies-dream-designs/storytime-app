import type { InngestFunction } from 'inngest'
import { inngest, INNGEST_EVENTS } from '@/lib/inngest/client'
import { processBookBuildJob } from '@/lib/print-books/jobs'

// Hard stop so a wedged pipeline can never loop forever inside one invocation.
// A full 16-spread build advances well under this many stages.
const MAX_ADVANCE_STEPS = 80

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
 * NOTE: This does not yet enforce a precise per-image throughput limit, nor does
 * it use the OpenAI Batch API — both are the agreed next design step (see
 * HANDOVER.md). Nothing emits `book.build.requested` yet, so this is inert until
 * the build route is wired to it.
 */
export const buildBook = inngest.createFunction(
  {
    id: 'build-book',
    // Cap concurrent builds account-wide. Each stage generates at most one
    // spread's images sequentially, so a small cap keeps us near OpenAI limits
    // until the Batch API step lands.
    concurrency: { limit: 3 },
    retries: 3,
    triggers: [{ event: INNGEST_EVENTS.bookBuildRequested }],
  },
  async ({ event, step }) => {
    const { jobId } = event.data as { jobId: string }

    for (let i = 0; i < MAX_ADVANCE_STEPS; i += 1) {
      const result = await step.run(`advance-${i}`, async () => {
        const { job, shouldContinue } = await processBookBuildJob(jobId)
        return { shouldContinue, status: job.status }
      })

      if (!result.shouldContinue) {
        return { jobId, status: result.status, steps: i + 1 }
      }
    }

    return { jobId, status: 'incomplete', reason: 'max-advance-steps', steps: MAX_ADVANCE_STEPS }
  }
)

export const inngestFunctions: InngestFunction.Any[] = [buildBook]
