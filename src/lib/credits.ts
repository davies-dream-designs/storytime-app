import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  estimateIllustratedBookCredits,
  REFERENCE_REDO_CREDIT_COST,
  STORY_CREDIT_COST,
} from "@/lib/pricing";
import { getStorycotIllustrationCountForAgeBand } from "@/lib/print-books/printProducts";
import type { BookBilling, BookProject } from "@/types/printBook";

const DEFAULT_CREDITS = 3;
const MAX_REDEEMED_GIFT_MARKERS = 100;

function getCredits(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : DEFAULT_CREDITS;
}

/**
 * Opt-in switch to the atomic DB credit ledger. Off by default so production
 * behaviour is unchanged until the `user_credits`/`credit_ledger` tables exist
 * (migration 0025) and a staging rehearsal has confirmed the Clerk→DB seed.
 */
function creditLedgerEnabled(): boolean {
  return process.env.CREDIT_LEDGER_ENABLED === "true";
}

/**
 * Returns the authoritative DB balance for a user, seeding the row from the
 * user's current Clerk value on first access. Only used when the ledger is on.
 */
async function ledgerBalance(
  userId: string,
  clerkCredits: number
): Promise<number> {
  const existing = await db.userCredits.getBalance(userId);
  if (typeof existing === "number") return existing;
  return db.userCredits.ensureSeeded(userId, clerkCredits);
}

/**
 * Mirrors the authoritative DB balance back to Clerk metadata so existing read
 * paths (account page, /api/user/credits display) stay roughly correct during
 * the transition. Best-effort; the DB remains the source of truth.
 */
async function mirrorToClerk(userId: string, balance: number): Promise<void> {
  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, {
      privateMetadata: { credits: balance },
    });
  } catch {
    // Non-fatal: DB balance is authoritative; Clerk is only a display mirror.
  }
}

export async function getUserCredits(
  userId: string
): Promise<{ credits: number; isAdmin: boolean }> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const clerkCredits = getCredits(user.privateMetadata.credits);
  const isAdmin = user.privateMetadata.isAdmin === true;
  if (creditLedgerEnabled()) {
    return { credits: await ledgerBalance(userId, clerkCredits), isAdmin };
  }
  return { credits: clerkCredits, isAdmin };
}

/**
 * Admin action: adjust a user's credit balance by `delta` (can be negative).
 * Clamps at zero. Returns the new balance.
 */
export async function adjustUserCredits(
  userId: string,
  delta: number,
  dedupeKey?: string
): Promise<number> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const currentCredits = getCredits(user.privateMetadata.credits);

  if (creditLedgerEnabled()) {
    await ledgerBalance(userId, currentCredits);
    const { balance } = await db.userCredits.applyDelta({
      userId,
      delta,
      reason: delta >= 0 ? "admin_grant" : "admin_debit",
      dedupeKey: dedupeKey ?? `adjust:${userId}:${Date.now()}:${delta}`,
    });
    await mirrorToClerk(userId, balance);
    return balance;
  }

  const next = Math.max(0, currentCredits + delta);
  await client.users.updateUserMetadata(userId, {
    privateMetadata: { credits: next },
  });
  return next;
}

/**
 * Debit one story-generation credit using a fresh read of the current balance
 * (never a stale value captured earlier in the request). Idempotency is the
 * caller's responsibility via `stories.creditChargedAt` — this only performs the
 * balance math against the latest Clerk value, clamped at zero.
 *
 * Returns the new balance, or `null` when the debit could not be applied (the
 * caller decides whether to surface a reconcile event).
 */
export async function chargeStoryGenerationCredit(
  userId: string,
  dedupeKey?: string
): Promise<number | null> {
  const client = await clerkClient();
  const fresh = await client.users.getUser(userId);
  if (fresh.privateMetadata.isAdmin === true) return null;
  const current = getCredits(fresh.privateMetadata.credits);

  if (creditLedgerEnabled()) {
    await ledgerBalance(userId, current);
    const { balance } = await db.userCredits.applyDelta({
      userId,
      delta: -STORY_CREDIT_COST,
      reason: "story_generation",
      dedupeKey: dedupeKey ?? `story:${userId}:${Date.now()}`,
    });
    await mirrorToClerk(userId, balance);
    return balance;
  }

  const next = Math.max(0, current - STORY_CREDIT_COST);
  await client.users.updateUserMetadata(userId, {
    privateMetadata: { credits: next },
  });
  return next;
}

export async function redeemGiftCredits(
  userId: string,
  giftOrderId: string,
  credits: number
): Promise<number> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const redeemedGiftOrderIds = Array.isArray(
    user.privateMetadata.redeemedGiftOrderIds
  )
    ? user.privateMetadata.redeemedGiftOrderIds.filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  const currentCredits = getCredits(user.privateMetadata.credits);

  if (redeemedGiftOrderIds.includes(giftOrderId)) {
    return currentCredits;
  }

  const nextRedeemedGiftOrderIds = [
    ...redeemedGiftOrderIds.slice(-(MAX_REDEEMED_GIFT_MARKERS - 1)),
    giftOrderId,
  ];
  const nextCredits = Math.max(0, currentCredits + credits);

  await client.users.updateUserMetadata(userId, {
    privateMetadata: {
      credits: nextCredits,
      redeemedGiftOrderIds: nextRedeemedGiftOrderIds,
    },
  });

  return nextCredits;
}

/**
 * Fail-fast affordability check used before running a (slow, killable) image
 * generation so we never do the work for a user who can't pay. The actual
 * charge happens only after the artifact is persisted, so a crash mid-render
 * can't strand a paid credit with no artifact and no refund.
 */
export async function assertImageRegenerationAffordable(
  userId: string
): Promise<void> {
  const { credits, isAdmin } = await getUserCredits(userId);
  if (!isAdmin && credits < 1) {
    throw new Error(
      "Insufficient credits. Regenerating an image costs 1 credit."
    );
  }
}

export async function chargeImageRegenerationCredit(
  userId: string
): Promise<{ credits: number; isAdmin: boolean }> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const isAdmin = user.privateMetadata.isAdmin === true;
  const currentCredits = getCredits(user.privateMetadata.credits);

  if (isAdmin) return { credits: currentCredits, isAdmin };

  if (currentCredits < 1) {
    throw new Error(
      "Insufficient credits. Regenerating an image costs 1 credit."
    );
  }

  await client.users.updateUserMetadata(userId, {
    privateMetadata: { credits: currentCredits - 1 },
  });

  return { credits: currentCredits - 1, isAdmin };
}

export async function refundImageRegenerationCredit(userId: string) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user.privateMetadata.isAdmin === true) return;

  const currentCredits = getCredits(user.privateMetadata.credits);
  await client.users.updateUserMetadata(userId, {
    privateMetadata: { credits: currentCredits + 1 },
  });
}

/** See assertImageRegenerationAffordable: fail-fast before slow avatar work. */
export async function assertReferenceRedoAffordable(
  userId: string
): Promise<void> {
  const { credits, isAdmin } = await getUserCredits(userId);
  if (!isAdmin && credits < REFERENCE_REDO_CREDIT_COST) {
    throw new Error(
      `Insufficient credits. Creating or redoing an illustrated reference costs ${REFERENCE_REDO_CREDIT_COST} credit.`
    );
  }
}

export async function chargeReferenceRedoCredit(
  userId: string
): Promise<{ credits: number; isAdmin: boolean; charged: boolean }> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const isAdmin = user.privateMetadata.isAdmin === true;
  const currentCredits = getCredits(user.privateMetadata.credits);

  if (isAdmin) return { credits: currentCredits, isAdmin, charged: false };

  if (currentCredits < REFERENCE_REDO_CREDIT_COST) {
    throw new Error(
      `Insufficient credits. Creating or redoing an illustrated reference costs ${REFERENCE_REDO_CREDIT_COST} credit.`
    );
  }

  const nextCredits = currentCredits - REFERENCE_REDO_CREDIT_COST;
  await client.users.updateUserMetadata(userId, {
    privateMetadata: { credits: nextCredits },
  });

  return { credits: nextCredits, isAdmin, charged: true };
}

export async function refundReferenceRedoCredit(userId: string) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user.privateMetadata.isAdmin === true) return;

  const currentCredits = getCredits(user.privateMetadata.credits);
  await client.users.updateUserMetadata(userId, {
    privateMetadata: { credits: currentCredits + REFERENCE_REDO_CREDIT_COST },
  });
}

export function needsIllustratedBookReservation(project: BookProject) {
  return (
    project.billing?.product !== "illustrated_book" ||
    (project.billing.status !== "reserved" &&
      project.billing.status !== "captured")
  );
}

export async function reserveIllustratedBookCredits(
  project: BookProject,
  forceCharge = false
) {
  if (!forceCharge && !needsIllustratedBookReservation(project)) return project;

  const client = await clerkClient();
  const user = await client.users.getUser(project.userId);
  const isAdmin = user.privateMetadata.isAdmin === true;
  const currentCredits = getCredits(user.privateMetadata.credits);
  const now = new Date().toISOString();
  const estimate = estimateIllustratedBookCredits({
    ageBand: project.ageBand,
    pageCount: project.pageCount,
    illustrationCount: getStorycotIllustrationCountForAgeBand(project.ageBand),
  });

  if (!isAdmin && currentCredits < estimate.credits) {
    throw new Error(
      `Insufficient credits. This illustrated book costs ${estimate.credits} credits.`
    );
  }

  if (!isAdmin) {
    await client.users.updateUserMetadata(project.userId, {
      privateMetadata: {
        credits: currentCredits - estimate.credits,
      },
    });
  }

  const billing: BookBilling = {
    product: "illustrated_book",
    status: isAdmin ? "captured" : "reserved",
    credits: isAdmin ? 0 : estimate.credits,
    reservedAt: now,
    capturedAt: isAdmin ? now : undefined,
  };

  return (
    (await db.bookProjects.update(project.id, {
      billing,
    })) ?? { ...project, billing }
  );
}

export async function captureIllustratedBookCredits(project: BookProject) {
  if (project.billing?.status !== "reserved") return project;

  const billing: BookBilling = {
    ...project.billing,
    status: "captured",
    capturedAt: new Date().toISOString(),
  };

  return (
    (await db.bookProjects.update(project.id, {
      billing,
    })) ?? { ...project, billing }
  );
}

export async function refundIllustratedBookCredits(project: BookProject) {
  if (project.billing?.status !== "reserved" || project.billing.credits <= 0) {
    return project;
  }

  const client = await clerkClient();
  const user = await client.users.getUser(project.userId);
  const currentCredits = getCredits(user.privateMetadata.credits);

  await client.users.updateUserMetadata(project.userId, {
    privateMetadata: {
      credits: currentCredits + project.billing.credits,
    },
  });

  const billing: BookBilling = {
    ...project.billing,
    status: "refunded",
    refundedAt: new Date().toISOString(),
  };

  return (
    (await db.bookProjects.update(project.id, {
      billing,
    })) ?? { ...project, billing }
  );
}
