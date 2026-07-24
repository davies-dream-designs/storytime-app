import { Inngest } from 'inngest'

/**
 * Shared Inngest client for the print-book pipeline.
 *
 * Inngest gives us a durable job queue with built-in concurrency and throttle
 * controls, which is what we need to stop the book build from tripping OpenAI's
 * per-minute image rate limit under multi-user load. See the print-book jobs
 * pipeline for how functions are registered.
 */
export const inngest = new Inngest({
  id: 'storycot',
  // Signing key + event key are read from INNGEST_SIGNING_KEY / INNGEST_EVENT_KEY
  // in the environment by the SDK. Locally, the Inngest dev server needs neither.
})

/** Event names emitted into Inngest. Keep these centralised and typed. */
export const INNGEST_EVENTS = {
  bookBuildRequested: 'storycot/book.build.requested',
} as const
