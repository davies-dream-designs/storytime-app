import "server-only";

import { generateTradeTitleManuscript } from "@/lib/trade-books/generateManuscript";
import { TradeBookJobPermanentError } from "@/lib/trade-books/worker";
import type { TradeBookWorkerContext } from "@/lib/trade-books/worker";

function getTradeTitleId(payload: Record<string, unknown>): string {
  const tradeTitleId = payload.tradeTitleId;
  if (typeof tradeTitleId !== "string" || !tradeTitleId.trim()) {
    throw new TradeBookJobPermanentError("Trade job is missing tradeTitleId");
  }
  return tradeTitleId;
}

export async function handleTradeBookJob(
  context: TradeBookWorkerContext
): Promise<void> {
  if (context.job.kind !== "generate_title") {
    throw new TradeBookJobPermanentError(
      `Unsupported trade job kind ${context.job.kind}`
    );
  }

  await context.heartbeat();
  await generateTradeTitleManuscript(getTradeTitleId(context.job.payload));
  await context.heartbeat();
}
