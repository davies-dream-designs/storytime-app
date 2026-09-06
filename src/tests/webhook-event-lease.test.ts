import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryDb } from "@/tests/helpers/memoryDb";

const db = createMemoryDb();

describe("processedWebhookEvents lease", () => {
  beforeEach(() => db._reset());

  it("lets the first caller claim and skips genuine duplicates once done", async () => {
    expect(await db.processedWebhookEvents.claim("evt_1", "stripe")).toBe(true);
    // While pending (still processing) a redelivery must not double-run.
    expect(await db.processedWebhookEvents.claim("evt_1", "stripe")).toBe(false);
    await db.processedWebhookEvents.markDone("evt_1");
    // After done, redeliveries are permanent duplicates.
    expect(await db.processedWebhookEvents.claim("evt_1", "stripe")).toBe(false);
  });

  it("allows a redelivery to re-run after release (known failure)", async () => {
    expect(await db.processedWebhookEvents.claim("evt_2", "stripe")).toBe(true);
    await db.processedWebhookEvents.release("evt_2");
    expect(await db.processedWebhookEvents.claim("evt_2", "stripe")).toBe(true);
  });
});
