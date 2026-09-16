import { db } from "@/lib/db";
import { processBookBuildJob } from "@/lib/print-books/jobs";
import { generateTradeCharacterBible } from "@/lib/trade-books/generateTradeCharacterBible";
import { TradeBookJobPermanentError } from "@/lib/trade-books/worker";

export async function buildTradeBook(
  tradeTitleId: string,
  options: {
    fetchImpl?: typeof fetch;
    heartbeat?: () => Promise<void>;
  } = {}
): Promise<void> {
  const title = await db.tradeTitles.getById(tradeTitleId);
  if (!title) throw new TradeBookJobPermanentError("Trade title not found");

  if (title.status === "book_ready") return;

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
    const now = new Date();
    await db.tradeTitles.update(tradeTitleId, { status: "book_ready" });
    if (title.storyId) {
      await db.stories.update(title.storyId, {
        visibility: "public",
        publicReviewStatus: "approved",
        publicReviewedAt: now.toISOString(),
        publicReviewedBy: "trade-system",
        publicAuthorName: "Storycot",
      });
    }
    return;
  }

  const story = await db.stories.getById(project.sourceStoryId);
  if (!story) throw new TradeBookJobPermanentError("Story not found");

  const profile = await db.profiles.getById(project.profileId);
  if (!profile) throw new TradeBookJobPermanentError("Profile not found");

  if (!project.characterBible) {
    const bible = await generateTradeCharacterBible({
      profile,
      story,
      options: { fetchImpl: options.fetchImpl },
    });
    await db.bookProjects.update(project.id, { characterBible: bible });
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
    const now = new Date();
    await db.tradeTitles.update(tradeTitleId, { status: "book_ready" });
    if (title.storyId) {
      await db.stories.update(title.storyId, {
        visibility: "public",
        publicReviewStatus: "approved",
        publicReviewedAt: now.toISOString(),
        publicReviewedBy: "trade-system",
        publicAuthorName: "Storycot",
      });
    }
  }
}
