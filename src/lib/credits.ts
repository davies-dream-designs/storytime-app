import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { estimateIllustratedBookCredits } from "@/lib/pricing";
import { getStorycotIllustrationCountForAgeBand } from "@/lib/print-books/printProducts";
import type { BookBilling, BookProject } from "@/types/printBook";

const DEFAULT_CREDITS = 3;
const MAX_REDEEMED_GIFT_MARKERS = 100;

function getCredits(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : DEFAULT_CREDITS;
}

export async function getUserCredits(
  userId: string
): Promise<{ credits: number; isAdmin: boolean }> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return {
    credits: getCredits(user.privateMetadata.credits),
    isAdmin: user.privateMetadata.isAdmin === true,
  };
}

/**
 * Admin action: adjust a user's credit balance by `delta` (can be negative).
 * Clamps at zero. Returns the new balance.
 */
export async function adjustUserCredits(
  userId: string,
  delta: number
): Promise<number> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const currentCredits = getCredits(user.privateMetadata.credits);
  const next = Math.max(0, currentCredits + delta);
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
