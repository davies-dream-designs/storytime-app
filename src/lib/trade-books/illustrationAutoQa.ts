import { db } from "@/lib/db";
import { checkIllustrationQa } from "@/lib/trade-books/illustrationQa";
import { regenerateBookSpreadPageImage } from "@/lib/print-books/jobs";
import { TRADE_SYSTEM_USER_ID } from "@/types/tradeBook";
import type {
  BookProject,
  BookSpread,
  IllustrationQaVerdict,
} from "@/types/printBook";

const MAX_AUTO_REROLLS = 2;

function isIllustratedSpread(
  spread: BookProject["spreads"][number]
): boolean {
  return Boolean(spread.leftPageImageUrl) && spread.leftPageImageStatus !== "failed";
}

/**
 * Runs a vision-model QA pass over every illustrated spread in a finished
 * trade book build, auto-rerolling (feeding the detected defect back in as a
 * correctionNote, reusing the same channel the admin "reroll" button uses)
 * up to MAX_AUTO_REROLLS times per spread. Spreads still flagged afterwards
 * are left as-is with a qa verdict recorded so the admin review UI can
 * surface them — this does not block the book from completing/publishing,
 * it just leaves a trail for manual follow-up.
 *
 * Note: each reroll re-runs the full export pipeline (PDFs/EPUB/proofing)
 * via regenerateBookSpreadPageImage, so a book with several flagged spreads
 * can take noticeably longer to finish its build. This trades speed for
 * reusing the same tested reroll path the admin UI and consumer product use,
 * rather than adding a second lower-level image-only regeneration path.
 */
async function recordQaVerdict(
  projectId: string,
  spreadId: string,
  verdict: IllustrationQaVerdict
): Promise<BookProject | undefined> {
  const project = await db.bookProjects.getById(projectId);
  if (!project) return undefined;
  const spread = project.spreads.find(
    (item: BookSpread) => item.id === spreadId
  );
  if (!spread) return project;

  const nextSpread: BookSpread = {
    ...spread,
    leftPageQa: spread.leftPageQa
      ? { ...spread.leftPageQa, qa: verdict }
      : {
          provider: "openai",
          generatedAt: verdict.checkedAt,
          characterReferenceIds: [],
          characterReferenceNames: [],
          continuityReferenceIds: [],
          continuityReferenceLabels: [],
          qa: verdict,
        },
  };

  return db.bookProjects.update(projectId, {
    spreads: project.spreads.map((item: BookSpread) =>
      item.id === spreadId ? nextSpread : item
    ),
  });
}

export async function runIllustrationAutoQa(
  projectId: string,
  options: { fetchImpl?: typeof fetch; heartbeat?: () => Promise<void> } = {}
): Promise<{ flaggedSpreadIds: string[] }> {
  const flaggedSpreadIds: string[] = [];
  const reviewModel = process.env.TRADE_BOOKS_REVIEW_MODEL?.trim() ?? "unknown";

  const initialProject = await db.bookProjects.getById(projectId);
  if (!initialProject) throw new Error("Book project not found");

  const spreadIds = initialProject.spreads
    .filter(isIllustratedSpread)
    .map((spread: BookSpread) => spread.id);

  for (const spreadId of spreadIds) {
    let attempts = 0;
    let verdict: IllustrationQaVerdict | undefined;

    for (;;) {
      const project = await db.bookProjects.getById(projectId);
      const spread = project?.spreads.find(
        (item: BookSpread) => item.id === spreadId
      );
      if (!spread?.leftPageImageUrl) break;

      let result;
      try {
        result = await checkIllustrationQa({
          imageUrl: spread.leftPageImageUrl,
          fetchImpl: options.fetchImpl,
        });
      } catch (error) {
        verdict = {
          defect: false,
          category: "none",
          description:
            error instanceof Error ? error.message : "QA check failed",
          autoRerollAttempts: attempts,
          needsManualReview: true,
          checkedAt: new Date().toISOString(),
          reviewModel,
        };
        break;
      }

      verdict = {
        ...result,
        autoRerollAttempts: attempts,
        needsManualReview: result.defect && attempts >= MAX_AUTO_REROLLS,
        checkedAt: new Date().toISOString(),
        reviewModel,
      };

      if (!result.defect || attempts >= MAX_AUTO_REROLLS) break;

      attempts += 1;
      await regenerateBookSpreadPageImage({
        projectId,
        userId: TRADE_SYSTEM_USER_ID,
        spreadId,
        side: "left",
        correctionNote: result.description || undefined,
      });
      if (options.heartbeat) await options.heartbeat();
    }

    if (verdict) {
      await recordQaVerdict(projectId, spreadId, verdict);
      if (verdict.needsManualReview) flaggedSpreadIds.push(spreadId);
    }
  }

  return { flaggedSpreadIds };
}
