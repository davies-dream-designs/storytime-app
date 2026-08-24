// Data-driven ETA for the illustration build phase.
//
// Illustrations finish in concurrency-sized batches, each carrying a
// `generatedAt` timestamp. We estimate remaining time from real throughput
// rather than a hardcoded guess. Throughput is measured from the FIRST
// completion onward so the heavier cover/seed step (which happens before any
// illustration completes) does not skew the rate.

const MIN_ELAPSED_SECONDS = 1;

/**
 * Estimate seconds remaining for the illustration build.
 *
 * @param completedAtMs Completion timestamps (ms) of finished illustrations.
 * @param total Total number of illustrations expected.
 * @param nowMs Current time (ms).
 * @returns Seconds remaining, or null when there is not enough data yet.
 */
export function computeEtaSeconds(
  completedAtMs: number[],
  total: number,
  nowMs: number
): number | null {
  const valid = completedAtMs
    .filter((ts) => Number.isFinite(ts))
    .sort((a, b) => a - b);
  const completed = valid.length;

  // Need at least two completions to measure a rate, and something left to do.
  if (completed < 2 || total <= completed) return null;

  const firstCompletionMs = valid[0]!;
  const elapsedSeconds = Math.max(
    MIN_ELAPSED_SECONDS,
    (nowMs - firstCompletionMs) / 1000
  );
  const imagesSinceFirst = completed - 1;
  const ratePerSecond = imagesSinceFirst / elapsedSeconds;
  if (ratePerSecond <= 0) return null;

  const remaining = total - completed;
  return remaining / ratePerSecond;
}

/**
 * Smooth ETA across polls so the countdown glides and never jumps upward
 * (a rising countdown reads as broken). Resets when a new/longer estimate is
 * clearly a fresh build rather than noise.
 */
export function smoothEtaSeconds(
  previous: number | null,
  next: number | null
): number | null {
  if (next == null) return previous;
  if (previous == null) return next;

  // Exponential moving average for gentle motion.
  const blended = previous * 0.6 + next * 0.4;

  // Allow a large jump up only when the estimate roughly doubles (e.g. the
  // build genuinely stalled or restarted); otherwise keep it non-increasing.
  if (blended > previous && next < previous * 2) {
    return previous;
  }
  return blended;
}

/** "M:SS" elapsed label. */
export function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const CREEP_MAX = 92;
const CREEP_TAU_SECONDS = 55;

/**
 * A time-based progress "creep" so the bar keeps inching forward during the
 * long, lumpy waits between illustration batches (which otherwise leave the
 * real progress frozen for a minute or more). Eases toward CREEP_MAX and never
 * overtakes real progress once a batch lands.
 */
export function creepProgress(
  elapsedSeconds: number,
  realProgress: number
): number {
  const eased =
    CREEP_MAX * (1 - Math.exp(-Math.max(0, elapsedSeconds) / CREEP_TAU_SECONDS));
  return Math.round(Math.min(CREEP_MAX, Math.max(realProgress, eased)));
}

const FINALIZE_BASE_SECONDS = 20;
const FINALIZE_PER_PAGE_SECONDS = 3;
const FINALIZE_MIN_REMAINING = 5;

/**
 * Rough remaining estimate for the finalizing/compose phase. It has no
 * per-item progress signal to measure, so this is a page-scaled expectation
 * (base + k·pages) minus elapsed, floored. Deliberately fed through the same
 * vague `formatBuildEta` buckets so it never reads as a precise promise.
 */
export function estimateFinalizeRemainingSeconds(
  pageCount: number,
  elapsedSeconds: number
): number {
  const expected =
    FINALIZE_BASE_SECONDS + FINALIZE_PER_PAGE_SECONDS * Math.max(0, pageCount);
  const remaining = expected - Math.max(0, elapsedSeconds);
  return Math.max(FINALIZE_MIN_REMAINING, remaining);
}

export type BuildEtaPhase = "illustrating" | "finalizing";

/**
 * Human-friendly ETA copy. Deliberately vague so an approximate estimate never
 * reads as a broken promise.
 */
export function formatBuildEta(
  seconds: number | null,
  phase: BuildEtaPhase = "illustrating"
): string {
  if (phase === "finalizing") return "Adding final touches…";
  if (seconds == null) return "Estimating time left…";
  if (seconds <= 8) return "Almost done";
  if (seconds < 60) return "Less than a minute left";

  const minutes = Math.max(1, Math.round(seconds / 60));
  return `About ${minutes} minute${minutes === 1 ? "" : "s"} left`;
}
