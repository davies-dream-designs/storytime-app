import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryDb } from "@/tests/helpers/memoryDb";

const memoryDb = createMemoryDb();

const { mockGetUser, mockUpdateUserMetadata } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpdateUserMetadata: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db", () => ({ db: memoryDb }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({
    users: {
      getUser: mockGetUser,
      updateUserMetadata: mockUpdateUserMetadata,
    },
  })),
}));

describe("credit ledger (CREDIT_LEDGER_ENABLED)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    memoryDb._reset();
    process.env.CREDIT_LEDGER_ENABLED = "true";
    mockGetUser.mockResolvedValue({ privateMetadata: { credits: 5 } });
  });

  afterEach(() => {
    delete process.env.CREDIT_LEDGER_ENABLED;
  });

  it("seeds the DB balance from Clerk on first read", async () => {
    const { getUserCredits } = await import("@/lib/credits");
    expect((await getUserCredits("user-1")).credits).toBe(5);
    expect(await memoryDb.userCredits.getBalance("user-1")).toBe(5);
  });

  it("charges a story credit atomically and mirrors to Clerk", async () => {
    const { chargeStoryGenerationCredit } = await import("@/lib/credits");
    expect(await chargeStoryGenerationCredit("user-1", "story:s1")).toBe(4);
    expect(await memoryDb.userCredits.getBalance("user-1")).toBe(4);
    expect(mockUpdateUserMetadata).toHaveBeenCalledWith("user-1", {
      privateMetadata: { credits: 4 },
    });
  });

  it("is idempotent: the same story dedupe key never double-charges", async () => {
    const { chargeStoryGenerationCredit } = await import("@/lib/credits");
    expect(await chargeStoryGenerationCredit("user-1", "story:s1")).toBe(4);
    // A retry with the same key must NOT debit again.
    expect(await chargeStoryGenerationCredit("user-1", "story:s1")).toBe(4);
    expect(await memoryDb.userCredits.getBalance("user-1")).toBe(4);
  });

  it("does not lose updates across concurrent charges (distinct keys)", async () => {
    const { chargeStoryGenerationCredit } = await import("@/lib/credits");
    await Promise.all([
      chargeStoryGenerationCredit("user-1", "story:a"),
      chargeStoryGenerationCredit("user-1", "story:b"),
      chargeStoryGenerationCredit("user-1", "story:c"),
    ]);
    // 5 - 3 distinct charges = 2. Under the old Clerk RMW this could lose writes.
    expect(await memoryDb.userCredits.getBalance("user-1")).toBe(2);
  });

  it("admin grant is idempotent by dedupe key", async () => {
    const { adjustUserCredits } = await import("@/lib/credits");
    expect(await adjustUserCredits("user-1", 10, "grant:g1")).toBe(15);
    expect(await adjustUserCredits("user-1", 10, "grant:g1")).toBe(15);
    expect(await memoryDb.userCredits.getBalance("user-1")).toBe(15);
  });

  it("clamps at zero", async () => {
    mockGetUser.mockResolvedValue({ privateMetadata: { credits: 0 } });
    const { chargeStoryGenerationCredit } = await import("@/lib/credits");
    expect(await chargeStoryGenerationCredit("user-1", "story:z")).toBe(0);
  });
});
