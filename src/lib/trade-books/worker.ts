import "server-only";

import { db } from "@/lib/db";
import {
  getTradeBookRetryAt,
  shouldRetryTradeBookJob,
} from "@/lib/trade-books/retry";
import type { TradeBookJob } from "@/types/tradeBook";

const LEASE_MS = 30 * 60 * 1000;
const HEARTBEAT_MS = 5 * 60 * 1000;

export class TradeBookJobPermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TradeBookJobPermanentError";
  }
}

export interface TradeBookWorkerContext {
  job: TradeBookJob;
  heartbeat(): Promise<void>;
}

export type TradeBookJobHandler = (
  context: TradeBookWorkerContext
) => Promise<void>;

export type TradeBookJobQueue = Pick<
  typeof db.tradeBookJobs,
  "claimNext" | "heartbeat" | "complete" | "scheduleRetry" | "fail"
>;

function leaseExpiry(now: Date): string {
  return new Date(now.getTime() + LEASE_MS).toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unknown trade book worker error";
}

export async function runTradeBookWorkerCycle(
  handler: TradeBookJobHandler,
  now = new Date(),
  queue: TradeBookJobQueue = db.tradeBookJobs,
  clock: () => Date = () => new Date()
): Promise<"idle" | "completed" | "retry_scheduled" | "failed" | "lease_lost"> {
  const leaseToken = crypto.randomUUID();
  const claimedAt = now.toISOString();
  const job = await queue.claimNext({
    leaseToken,
    now: claimedAt,
    leaseExpiresAt: leaseExpiry(now),
  });
  if (!job) return "idle";

  let leaseLost = false;
  const heartbeat = async () => {
    const heartbeatAt = clock();
    const refreshed = await queue.heartbeat({
      id: job.id,
      leaseToken,
      now: heartbeatAt.toISOString(),
      leaseExpiresAt: leaseExpiry(heartbeatAt),
    });
    if (!refreshed) leaseLost = true;
  };
  const timer = setInterval(() => {
    void heartbeat();
  }, HEARTBEAT_MS);

  try {
    await handler({ job, heartbeat });
    if (leaseLost) return "lease_lost";
    await queue.complete({
      id: job.id,
      leaseToken,
      now: clock().toISOString(),
    });
    return "completed";
  } catch (error) {
    if (leaseLost) return "lease_lost";
    const failedAt = clock();
    const message = errorMessage(error);
    if (
      error instanceof TradeBookJobPermanentError ||
      !shouldRetryTradeBookJob(job.attempts)
    ) {
      await queue.fail({
        id: job.id,
        leaseToken,
        error: message,
        now: failedAt.toISOString(),
      });
      return "failed";
    }

    await queue.scheduleRetry({
      id: job.id,
      leaseToken,
      error: message,
      availableAt: getTradeBookRetryAt(job.attempts, failedAt),
      now: failedAt.toISOString(),
    });
    return "retry_scheduled";
  } finally {
    clearInterval(timer);
  }
}
