import { describe, expect, it } from "vitest";
import { shouldSendBookReadyEmail } from "@/lib/print-books/jobs";
import type { BookProject } from "@/types/printBook";

function createBookProject(
  assets: BookProject["assets"] = { proofVersion: 1 }
): BookProject {
  return {
    id: "book-1",
    userId: "user-1",
    sourceStoryId: "story-1",
    profileId: "profile-1",
    ageBand: "3-5",
    status: "ready",
    trimSize: "storycot-dynamic-square",
    pageCount: 24,
    spreadCount: 12,
    completedSpreads: 12,
    totalSpreads: 12,
    currentStageLabel: "Ready",
    beats: [],
    spreads: [],
    assets,
    retryCount: 0,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
}

describe("book ready email policy", () => {
  it("only sends the ready email for the initial full build", () => {
    const project = createBookProject();

    expect(shouldSendBookReadyEmail({ mode: "full", project })).toBe(true);
    expect(shouldSendBookReadyEmail({ mode: "exports", project })).toBe(false);
    expect(shouldSendBookReadyEmail({ mode: "art", project })).toBe(false);
    expect(shouldSendBookReadyEmail({ mode: "finalize", project })).toBe(
      false
    );
  });

  it("does not send again once the ready email marker exists", () => {
    expect(
      shouldSendBookReadyEmail({
        mode: "full",
        project: createBookProject({
          proofVersion: 1,
          bookReadyEmailSentAt: "2026-07-15T00:00:00.000Z",
        }),
      })
    ).toBe(false);
  });
});
