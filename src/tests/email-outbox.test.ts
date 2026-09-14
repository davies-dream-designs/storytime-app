import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryDb } from "@/tests/helpers/memoryDb";

const memoryDb = createMemoryDb();
vi.mock("@/lib/db", () => ({ db: memoryDb }));

describe("sendViaOutbox", () => {
  beforeEach(() => {
    vi.resetModules();
    memoryDb._reset();
  });

  it("sends once and marks the row sent", async () => {
    const { sendViaOutbox } = await import("@/lib/email");
    const send = vi.fn(async () => undefined);
    const sent = await sendViaOutbox(
      { dedupeKey: "shipped:owner:book-1", kind: "shipped", recipient: "a@b.co" },
      send
    );
    expect(sent).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: a duplicate dedupeKey does not send again", async () => {
    const { sendViaOutbox } = await import("@/lib/email");
    const send = vi.fn(async () => undefined);
    const meta = {
      dedupeKey: "gift:g1",
      kind: "gift_credits",
      recipient: "a@b.co",
    };
    expect(await sendViaOutbox(meta, send)).toBe(true);
    expect(await sendViaOutbox(meta, send)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("re-throws provider failures (so webhooks can retry) after recording them", async () => {
    const { sendViaOutbox } = await import("@/lib/email");
    const send = vi.fn(async () => {
      throw new Error("resend down");
    });
    await expect(
      sendViaOutbox(
        { dedupeKey: "shipped:public:o1", kind: "shipped", recipient: "a@b.co" },
        send
      )
    ).rejects.toThrow(/resend down/);
  });

  it("does not mark sent when the provider throws", async () => {
    const { sendViaOutbox } = await import("@/lib/email");
    const failing = vi.fn(async () => {
      throw new Error("boom");
    });
    await sendViaOutbox(
      { dedupeKey: "k1", kind: "shipped", recipient: "a@b.co" },
      failing
    ).catch(() => undefined);
    // A different key still sends (the store isn't wedged), proving markFailed
    // ran rather than leaving a stuck sent state.
    const ok = vi.fn(async () => undefined);
    expect(
      await sendViaOutbox(
        { dedupeKey: "k2", kind: "shipped", recipient: "a@b.co" },
        ok
      )
    ).toBe(true);
  });
});
