const RETRY_DELAYS_MS = [
  6 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  48 * 60 * 60 * 1000,
  72 * 60 * 60 * 1000,
] as const;

export const TRADE_BOOK_MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export function getTradeBookRetryAt(
  attempts: number,
  now = new Date()
): string {
  const delay = RETRY_DELAYS_MS[attempts - 1];
  if (!delay) {
    throw new Error("Trade book job has exhausted its retry schedule");
  }
  return new Date(now.getTime() + delay).toISOString();
}

export function shouldRetryTradeBookJob(attempts: number): boolean {
  return attempts < TRADE_BOOK_MAX_ATTEMPTS;
}
