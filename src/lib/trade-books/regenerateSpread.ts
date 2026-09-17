import { db } from "@/lib/db";
import { regenerateBookSpreadPageImage } from "@/lib/print-books/jobs";
import { isTradeBookProject } from "@/lib/trade-books/imageProvider";
import { TradeBookJobPermanentError } from "@/lib/trade-books/worker";
import { TRADE_SYSTEM_USER_ID } from "@/types/tradeBook";

// Trade titles are owned by the synthetic `trade-system` user, so the normal
// owner-scoped image-regenerate path (`/api/books/[id]/images/regenerate`)
// can never reach them. This runs the same underlying regeneration — through
// the project's Cliproxy image provider — from the admin trade review UI,
// bypassing the consumer credit reservation trade builds never use.
export async function regenerateTradeBookSpreadImage(input: {
  bookProjectId: string;
  spreadId: string;
  side: "left" | "right";
  correctionNote?: string;
}): Promise<void> {
  const project = await db.bookProjects.getById(input.bookProjectId);
  if (!project) {
    throw new TradeBookJobPermanentError("Book project not found");
  }
  if (!isTradeBookProject(project)) {
    throw new TradeBookJobPermanentError(
      "This project is not a trade catalogue book"
    );
  }

  await regenerateBookSpreadPageImage({
    projectId: input.bookProjectId,
    userId: TRADE_SYSTEM_USER_ID,
    spreadId: input.spreadId,
    side: input.side,
    correctionNote: input.correctionNote,
  });
}
