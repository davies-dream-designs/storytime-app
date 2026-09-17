import { buildTradeBook } from "@/lib/trade-books/buildTradeBook";
import { regenerateTradeBookSpreadImage } from "@/lib/trade-books/regenerateSpread";
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

function getStringField(
  payload: Record<string, unknown>,
  field: string
): string {
  const value = payload[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new TradeBookJobPermanentError(`Trade job is missing ${field}`);
  }
  return value;
}

export async function handleTradeBookJob(
  context: TradeBookWorkerContext
): Promise<void> {
  if (context.job.kind === "generate_title") {
    await context.heartbeat();
    await generateTradeTitleManuscript(getTradeTitleId(context.job.payload));
    await context.heartbeat();
    return;
  }

  if (context.job.kind === "build_trade_book") {
    await context.heartbeat();
    await buildTradeBook(getTradeTitleId(context.job.payload), {
      heartbeat: context.heartbeat,
    });
    await context.heartbeat();
    return;
  }

  if (context.job.kind === "regenerate_trade_spread") {
    await context.heartbeat();
    const payload = context.job.payload;
    await regenerateTradeBookSpreadImage({
      bookProjectId: getStringField(payload, "bookProjectId"),
      spreadId: getStringField(payload, "spreadId"),
      side: payload.side === "right" ? "right" : "left",
      correctionNote:
        typeof payload.correctionNote === "string"
          ? payload.correctionNote
          : undefined,
    });
    await context.heartbeat();
    return;
  }

  throw new TradeBookJobPermanentError(
    `Unsupported trade job kind ${context.job.kind}`
  );
}
