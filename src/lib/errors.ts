// Central error taxonomy for Storycot.
//
// Goal: every failure the app can produce has ONE specific, stable code so it is
// distinguishable and actionable in the admin panel. `AppError` carries the code
// plus everything the admin needs (domain, severity, whether it's retryable, a
// friendly user-facing message, and structured context). Unknown/legacy codes
// still resolve to sensible metadata so nothing ever renders as a mystery.

export type ErrorDomain =
  | "story" // story generation
  | "book" // illustrated book build pipeline
  | "print" // print fulfillment (Lulu)
  | "payment" // Stripe checkout + webhooks
  | "credits" // credit reserve/capture/refund
  | "webhook" // inbound webhook processing
  | "external" // third-party API failures (OpenAI, Anthropic, ElevenLabs)
  | "system"; // config / db / anything infrastructural

// Ordered low → high. Used for sorting + threshold filtering in admin.
export type ErrorSeverity = "info" | "warning" | "error" | "critical";

export const SEVERITY_RANK: Record<ErrorSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

interface ErrorCodeMeta {
  domain: ErrorDomain;
  severity: ErrorSeverity;
  /** Can the same operation succeed on retry without user/dev intervention? */
  retryable: boolean;
  /** Default message safe to show an end user. */
  userMessage: string;
}

// The registry is the single source of truth. Add a code here and it is instantly
// classifiable everywhere (throw sites, event log, admin filters).
export const ERROR_REGISTRY = {
  // ── Story generation ──────────────────────────────────────────────────────
  "story.config_missing": {
    domain: "system",
    severity: "critical",
    retryable: false,
    userMessage: "Story generation is temporarily unavailable. We're on it.",
  },
  "story.no_credits": {
    domain: "credits",
    severity: "info",
    retryable: false,
    userMessage: "You're out of credits. Visit your account to top up.",
  },
  "story.profile_missing": {
    domain: "story",
    severity: "warning",
    retryable: false,
    userMessage: "We couldn't find that child profile. Try picking it again.",
  },
  "story.generation_failed": {
    domain: "story",
    severity: "error",
    retryable: true,
    userMessage: "The story didn't finish generating. Give it another go.",
  },
  "story.moderation_blocked": {
    domain: "story",
    severity: "warning",
    retryable: true,
    userMessage:
      "We couldn't generate that story safely. Try tweaking the details.",
  },

  // ── Illustrated book build ────────────────────────────────────────────────
  "book.planning_failed": {
    domain: "book",
    severity: "error",
    retryable: true,
    userMessage:
      "We hit a snag planning the book. Hit retry - it usually clears up.",
  },
  "book.bible_failed": {
    domain: "book",
    severity: "error",
    retryable: true,
    userMessage:
      "The character setup didn't finish. Retry to pick up where it left off.",
  },
  "book.illustration_failed": {
    domain: "book",
    severity: "error",
    retryable: true,
    userMessage:
      "Illustrations didn't finish generating. Retry and we'll pick up from where it stopped.",
  },
  "book.image_moderation_blocked": {
    domain: "book",
    severity: "warning",
    retryable: true,
    userMessage:
      "One of the illustrations was blocked by content safety. Retry - we'll simplify the prompt.",
  },
  "book.image_unusable": {
    domain: "book",
    severity: "warning",
    retryable: true,
    userMessage:
      "An illustration came back blank or corrupt. Retry to regenerate it.",
  },
  "book.image_rate_limited": {
    domain: "external",
    severity: "warning",
    retryable: true,
    userMessage:
      "We're being rate-limited by the image service. Retry in a moment.",
  },
  "book.reference_image_unavailable": {
    domain: "book",
    severity: "warning",
    retryable: true,
    userMessage:
      "A character reference image could not be loaded, so we'll use text details instead.",
  },
  "book.cover_failed": {
    domain: "book",
    severity: "warning",
    retryable: true,
    userMessage: "The cover art didn't generate. Retry the art step.",
  },
  "book.storage_upload_failed": {
    domain: "system",
    severity: "error",
    retryable: true,
    userMessage:
      "We couldn't save an illustration. Retry - it's usually transient.",
  },
  "book.compose_failed": {
    domain: "book",
    severity: "error",
    retryable: true,
    userMessage: "We couldn't assemble the book. Hit retry.",
  },
  "book.proofing_failed": {
    domain: "book",
    severity: "warning",
    retryable: true,
    userMessage:
      "Export refresh didn't finish. Your book is still available; refresh the PDFs again to retry.",
  },
  "book.pdf_failed": {
    domain: "book",
    severity: "error",
    retryable: true,
    userMessage: "We couldn't build the PDF. Refresh PDFs to try again.",
  },
  "book.epub_failed": {
    domain: "book",
    severity: "error",
    retryable: true,
    userMessage:
      "We couldn't build the e-reader file. Refresh exports to try again.",
  },
  "book.not_found": {
    domain: "book",
    severity: "warning",
    retryable: false,
    userMessage: "We couldn't find that book.",
  },
  "book.build_conflict": {
    domain: "book",
    severity: "info",
    retryable: false,
    userMessage: "A build is already running for this book.",
  },

  // ── Print fulfillment (Lulu) ──────────────────────────────────────────────
  "print.fulfillment_failed": {
    domain: "print",
    severity: "critical",
    retryable: true,
    userMessage:
      "There was a problem submitting your print order. We've been notified.",
  },
  "print.fulfillment_config_missing": {
    domain: "system",
    severity: "critical",
    retryable: false,
    userMessage: "Print fulfillment isn't configured. We've been notified.",
  },
  "print.shipping_missing": {
    domain: "print",
    severity: "error",
    retryable: true,
    userMessage: "We couldn't read the shipping address for this order.",
  },
  "print.already_submitted": {
    domain: "print",
    severity: "info",
    retryable: false,
    userMessage: "This print order has already been submitted.",
  },

  // ── Payment (Stripe) ──────────────────────────────────────────────────────
  "payment.signature_invalid": {
    domain: "payment",
    severity: "error",
    retryable: false,
    userMessage: "We couldn't verify that payment event.",
  },
  "payment.checkout_failed": {
    domain: "payment",
    severity: "error",
    retryable: true,
    userMessage: "We couldn't start checkout. Please try again.",
  },
  "payment.confirmation_email_failed": {
    domain: "payment",
    severity: "warning",
    retryable: false,
    userMessage: "Your order went through; the confirmation email didn't send.",
  },

  // ── Inbound webhooks ──────────────────────────────────────────────────────
  "webhook.processing_failed": {
    domain: "webhook",
    severity: "error",
    retryable: true,
    userMessage: "We couldn't process an incoming update.",
  },

  // ── External APIs ─────────────────────────────────────────────────────────
  "external.openai_error": {
    domain: "external",
    severity: "error",
    retryable: true,
    userMessage: "The image service returned an error. Retry shortly.",
  },
  "external.anthropic_error": {
    domain: "external",
    severity: "error",
    retryable: true,
    userMessage: "The story service returned an error. Retry shortly.",
  },
  "external.elevenlabs_error": {
    domain: "external",
    severity: "warning",
    retryable: true,
    userMessage:
      "Narration couldn't be generated right now. Try again shortly.",
  },

  // ── System / infrastructure ───────────────────────────────────────────────
  "system.db_unavailable": {
    domain: "system",
    severity: "critical",
    retryable: true,
    userMessage: "We're having a temporary hiccup. Please try again.",
  },
  "system.config_missing": {
    domain: "system",
    severity: "critical",
    retryable: false,
    userMessage: "Something's misconfigured on our end. We've been notified.",
  },
  "system.unknown": {
    domain: "system",
    severity: "error",
    retryable: true,
    userMessage: "Something went wrong. Please try again.",
  },
} as const satisfies Record<string, ErrorCodeMeta>;

export type ErrorCode = keyof typeof ERROR_REGISTRY;

/**
 * Resolve metadata for any code string - including legacy codes stored on old
 * rows (e.g. "illustrating:image_failed") and codes we've never seen. Never
 * throws, so the admin panel can always render a badge.
 */
export function getErrorCodeMeta(
  code: string | null | undefined
): ErrorCodeMeta & {
  code: string;
  known: boolean;
} {
  if (code && code in ERROR_REGISTRY) {
    return { code, known: true, ...ERROR_REGISTRY[code as ErrorCode] };
  }
  // Legacy / unknown: infer a domain from the code prefix so filtering still works.
  const domain = inferDomainFromLegacyCode(code);
  return {
    code: code ?? "unknown",
    known: false,
    domain,
    severity: "error",
    retryable: true,
    userMessage: "Something went wrong.",
  };
}

function inferDomainFromLegacyCode(
  code: string | null | undefined
): ErrorDomain {
  if (!code) return "system";
  const c = code.toLowerCase();
  // Legacy book codes look like "illustrating:image_failed", "planning_failed".
  if (
    c.startsWith("illustrating") ||
    c.startsWith("planning") ||
    c.startsWith("bible") ||
    c.startsWith("proofing") ||
    c.startsWith("composing")
  ) {
    return "book";
  }
  if (c.startsWith("print") || c.includes("fulfill")) return "print";
  if (c.startsWith("payment") || c.includes("stripe")) return "payment";
  if (c.startsWith("story")) return "story";
  const prefix = c.split(/[.:_]/)[0];
  if (
    prefix === "book" ||
    prefix === "print" ||
    prefix === "payment" ||
    prefix === "credits" ||
    prefix === "webhook" ||
    prefix === "external" ||
    prefix === "story"
  ) {
    return prefix as ErrorDomain;
  }
  return "system";
}

export interface AppErrorOptions {
  /** Developer-facing message (raw). Defaults to the code's user message. */
  message?: string;
  /** Override the friendly user-facing message for this instance. */
  userMessage?: string;
  /** Structured, JSON-serialisable context (ids, params, upstream status…). */
  context?: Record<string, unknown>;
  /** Original error, preserved for stack + debugging. */
  cause?: unknown;
}

/**
 * A classified application error. Throw these instead of bare `Error` so the
 * failure carries a stable code all the way to the admin panel.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly domain: ErrorDomain;
  readonly severity: ErrorSeverity;
  readonly retryable: boolean;
  readonly userMessage: string;
  readonly context?: Record<string, unknown>;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    const meta = ERROR_REGISTRY[code];
    super(options.message ?? meta.userMessage, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.domain = meta.domain;
    this.severity = meta.severity;
    this.retryable = meta.retryable;
    this.userMessage = options.userMessage ?? meta.userMessage;
    this.context = options.context;
  }
}

/** Convenience factory. */
export function appError(code: ErrorCode, options?: AppErrorOptions): AppError {
  return new AppError(code, options);
}

/**
 * Coerce any thrown value into an AppError. If it's already one it's returned
 * as-is; otherwise it's wrapped under `fallback` (default `system.unknown`),
 * preserving the original message and cause.
 */
export function toAppError(
  err: unknown,
  fallback: ErrorCode = "system.unknown"
): AppError {
  if (err instanceof AppError) return err;
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Unknown error";
  return new AppError(fallback, { message, cause: err });
}

// ── Event log records ───────────────────────────────────────────────────────

/** A persisted error/event row, as read back for the admin panel. */
export interface ErrorEventRecord {
  id: string;
  createdAt: string;
  domain: string;
  code: string;
  severity: string;
  userId?: string;
  userEmail?: string;
  entityType?: string;
  entityId?: string;
  message: string;
  rawError?: string;
  context?: Record<string, unknown>;
  source?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  note?: string;
}

/** Filters accepted by the admin event-log query. */
export interface ErrorEventFilters {
  domain?: ErrorDomain;
  code?: string;
  minSeverity?: ErrorSeverity;
  resolved?: boolean;
  userId?: string;
  entityId?: string;
  /** ISO timestamp lower bound (createdAt >= since). */
  since?: string;
  /** Free-text match against message / userEmail / userId / entityId. */
  search?: string;
  limit?: number;
}

/** Best-effort raw string (message + stack) for storing on the event log. */
export function rawErrorString(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ? `${err.message}\n${err.stack}` : err.message;
  }
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
