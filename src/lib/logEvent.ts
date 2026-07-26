import "server-only";
import { db } from "@/lib/db";
import {
  AppError,
  getErrorCodeMeta,
  rawErrorString,
  toAppError,
  type ErrorCode,
  type ErrorDomain,
  type ErrorSeverity,
} from "@/lib/errors";

export interface LogEventInput {
  /** Explicit classification code. Optional if `error` is an AppError. */
  code?: ErrorCode | string;
  /** The thrown value. If an AppError, its code/severity/context are used. */
  error?: unknown;
  /** Fallback code when `error` isn't an AppError. */
  fallbackCode?: ErrorCode;
  /** Override the stored developer-facing message. */
  message?: string;
  severity?: ErrorSeverity;
  domain?: ErrorDomain;
  userId?: string | null;
  userEmail?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  context?: Record<string, unknown> | null;
  /** Where this was logged from, e.g. "stripe/webhook" or "book/build". */
  source?: string | null;
}

/**
 * Record an error/event to the central log. Best-effort and defensive: it never
 * throws and never blocks the caller's failure path — if logging itself fails we
 * fall back to console so we don't mask the original problem.
 */
export async function logEvent(input: LogEventInput): Promise<void> {
  try {
    const app: AppError | undefined =
      input.error !== undefined
        ? toAppError(input.error, (input.fallbackCode ?? "system.unknown") as ErrorCode)
        : undefined;

    const code = input.code ?? app?.code ?? "system.unknown";
    const meta = getErrorCodeMeta(code);

    const context = {
      ...(app?.context ?? {}),
      ...(input.context ?? {}),
    };

    await db.errorEvents.create({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      domain: input.domain ?? meta.domain,
      code,
      severity: input.severity ?? meta.severity,
      userId: input.userId ?? null,
      userEmail: input.userEmail ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      message: input.message ?? app?.message ?? meta.userMessage,
      rawError: input.error !== undefined ? rawErrorString(input.error) : null,
      context: Object.keys(context).length ? context : null,
      source: input.source ?? null,
    });
  } catch (err) {
    // Never let logging break the request. Surface to server logs instead.
    console.error("[logEvent] failed to persist error event", err, {
      code: input.code,
      source: input.source,
    });
  }
}
