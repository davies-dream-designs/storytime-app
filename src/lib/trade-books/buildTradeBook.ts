import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { deriveBeatsFromStory } from "@/lib/print-books/beats";
import { composePrintBookSpreads } from "@/lib/print-books/composer";
import { processBookBuildJob } from "@/lib/print-books/jobs";
import { getBookProjectStageLabel } from "@/lib/print-books/status";
import { generateTradeCharacterBible } from "@/lib/trade-books/generateTradeCharacterBible";
import { TradeBookJobPermanentError } from "@/lib/trade-books/worker";


async function publishTradeStory(storyId: string) {
  const story = await db.stories.getById(storyId);
  if (!story) throw new TradeBookJobPermanentError("Story not found");

  await db.stories.update(storyId, {
    visibility: "public",
    publicReviewStatus: "approved",
    publicReviewedAt: new Date().toISOString(),
    publicReviewedBy: "trade-system",
    publicAuthorName: "Storycot",
    shareToken: story.shareToken ?? randomUUID().replaceAll("-", ""),
  });
}

export async function buildTradeBook(
  tradeTitleId: string,
  options: {
    fetchImpl?: typeof fetch;
    heartbeat?: () => Promise<void>;
  } = {}
): Promise<void> {
  const title = await db.tradeTitles.getById(tradeTitleId);
  if (!title) throw new TradeBookJobPermanentError("Trade title not found");

  if (title.status === "book_ready") {
    if (title.storyId) await publishTradeStory(title.storyId);
    return;
  }

  if (title.status !== "approved") {
    throw new TradeBookJobPermanentError(
      `Trade title cannot build book from status ${title.status}`
    );
  }

  if (!title.bookProjectId) {
    throw new TradeBookJobPermanentError(
      "Trade title has no bookProjectId — was the approve step completed?"
    );
  }

  const project = await db.bookProjects.getById(title.bookProjectId);
  if (!project) {
    throw new TradeBookJobPermanentError("BookProject not found");
  }

  if (project.status === "ready") {
    await db.tradeTitles.update(tradeTitleId, { status: "book_ready" });
    if (title.storyId) await publishTradeStory(title.storyId);
    return;
  }

  const story = await db.stories.getById(project.sourceStoryId);
  if (!story) throw new TradeBookJobPermanentError("Story not found");

  const profile = await db.profiles.getById(project.profileId);
  if (!profile) throw new TradeBookJobPermanentError("Profile not found");

  // Generate character bible via Cliproxy and set up spreads directly,
  // bypassing processBookBuildJob's bible stage (which calls the Anthropic SDK).
  // Skip if already in illustrating/later stage with a bible in place.
  const needsBible =
    project.status === "queued" ||
    project.status === "bible" ||
    !project.characterBible ||
    !project.spreads.length;
  if (needsBible) {
    const bible = await generateTradeCharacterBible({
      profile,
      story,
      options: { fetchImpl: options.fetchImpl },
    });
    const beats = project.beats.length
      ? project.beats
      : deriveBeatsFromStory(story);
    const spreads = composePrintBookSpreads({
      bookProjectId: project.id,
      story,
      profile,
      ageBand: project.ageBand,
      beats,
      characterBible: bible,
    });
    await db.bookProjects.update(project.id, {
      status: "illustrating",
      currentStageLabel: getBookProjectStageLabel("illustrating"),
      characterBible: bible,
      beats,
      spreads,
      completedSpreads: 0,
      totalSpreads: spreads.length,
    });
  }

  const job = await db.bookBuildJobs.getCurrentByProjectId(project.id);
  if (!job) {
    throw new TradeBookJobPermanentError(
      "No active book build job found for project"
    );
  }

  let result = await processBookBuildJob(job.id);
  if (options.heartbeat) await options.heartbeat();

  while (result.shouldContinue) {
    result = await processBookBuildJob(job.id);
    if (options.heartbeat) await options.heartbeat();
  }

  const finalProject = await db.bookProjects.getById(project.id);
  if (finalProject?.status === "ready") {
    await db.tradeTitles.update(tradeTitleId, { status: "book_ready" });
    if (title.storyId) await publishTradeStory(title.storyId);
  }
}
