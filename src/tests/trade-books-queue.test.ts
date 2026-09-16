import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryDb } from "@/tests/helpers/memoryDb";

const memoryDb = createMemoryDb();

import {
  TradeBookJobPermanentError,
  runTradeBookWorkerCycle,
} from "@/lib/trade-books/worker";

const firstAttempt = new Date("2026-08-17T00:00:00.000Z");
const firstLeaseExpiry = "2026-08-17T00:30:00.000Z";

beforeEach(() => memoryDb._reset());

describe("trade book job queue", () => {
  it("claims only due jobs in deterministic order and deduplicates enqueues", async () => {
    await memoryDb.tradeBookJobs.enqueue({
      kind: "generate_title",
      dedupeKey: "later",
      payload: {},
      availableAt: "2026-08-17T00:10:00.000Z",
    });
    const first = await memoryDb.tradeBookJobs.enqueue({
      kind: "generate_title",
      dedupeKey: "first",
      payload: {},
      availableAt: "2026-08-17T00:00:00.000Z",
    });
    const duplicate = await memoryDb.tradeBookJobs.enqueue({
      kind: "generate_title",
      dedupeKey: "first",
      payload: {},
    });

    const claimed = await memoryDb.tradeBookJobs.claimNext({
      leaseToken: "lease-1",
      now: firstAttempt.toISOString(),
      leaseExpiresAt: firstLeaseExpiry,
    });

    expect(first?.id).toBe(claimed?.id);
    expect(duplicate).toBeUndefined();
    expect(claimed?.attempts).toBe(1);
    expect(claimed?.status).toBe("running");
  });

  it("does not allow a stale worker to complete a reclaimed job", async () => {
    const job = await memoryDb.tradeBookJobs.enqueue({
      kind: "generate_title",
      dedupeKey: "stale",
      payload: {},
      availableAt: firstAttempt.toISOString(),
    });
    const initial = await memoryDb.tradeBookJobs.claimNext({
      leaseToken: "old-lease",
      now: firstAttempt.toISOString(),
      leaseExpiresAt: "2026-08-17T00:01:00.000Z",
    });
    const reclaimed = await memoryDb.tradeBookJobs.claimNext({
      leaseToken: "new-lease",
      now: "2026-08-17T00:01:01.000Z",
      leaseExpiresAt: "2026-08-17T00:31:01.000Z",
    });

    expect(initial?.id).toBe(job?.id);
    expect(reclaimed?.attempts).toBe(2);
    expect(
      await memoryDb.tradeBookJobs.complete({
        id: job!.id,
        leaseToken: "old-lease",
        now: "2026-08-17T00:01:02.000Z",
      })
    ).toBe(false);
    expect(
      await memoryDb.tradeBookJobs.complete({
        id: job!.id,
        leaseToken: "new-lease",
        now: "2026-08-17T00:01:02.000Z",
      })
    ).toBe(true);
  });

  it("schedules retryable failures and preserves terminal failures", async () => {
    const retryJob = await memoryDb.tradeBookJobs.enqueue({
      kind: "generate_title",
      dedupeKey: "retry",
      payload: {},
      availableAt: firstAttempt.toISOString(),
    });

    await expect(
      runTradeBookWorkerCycle(
        async () => {
          throw new Error("Cliproxy temporarily unavailable");
        },
        firstAttempt,
        memoryDb.tradeBookJobs,
        () => firstAttempt
      )
    ).resolves.toBe("retry_scheduled");

    expect(
      await memoryDb.tradeBookJobs.claimNext({
        leaseToken: "too-early",
        now: "2026-08-17T05:59:59.000Z",
        leaseExpiresAt: "2026-08-17T06:29:59.000Z",
      })
    ).toBeUndefined();
    const retried = await memoryDb.tradeBookJobs.claimNext({
      leaseToken: "retry-lease",
      now: "2026-08-17T06:00:00.000Z",
      leaseExpiresAt: "2026-08-17T06:30:00.000Z",
    });
    expect(retried?.id).toBe(retryJob?.id);
    expect(retried?.attempts).toBe(2);

    await memoryDb.tradeBookJobs.fail({
      id: retried!.id,
      leaseToken: "retry-lease",
      error: "reset",
      now: "2026-08-17T00:15:01.000Z",
    });
    const permanentJob = await memoryDb.tradeBookJobs.enqueue({
      kind: "generate_title",
      dedupeKey: "permanent",
      payload: {},
      availableAt: firstAttempt.toISOString(),
    });

    await expect(
      runTradeBookWorkerCycle(
        async () => {
          throw new TradeBookJobPermanentError("Blocked by safety policy");
        },
        firstAttempt,
        memoryDb.tradeBookJobs,
        () => firstAttempt
      )
    ).resolves.toBe("failed");

    expect(
      await memoryDb.tradeBookJobs.claimNext({
        leaseToken: "terminal",
        now: "2026-08-18T00:00:00.000Z",
        leaseExpiresAt: "2026-08-18T00:30:00.000Z",
      })
    ).toBeUndefined();
    expect(permanentJob).toBeDefined();
  });
});
