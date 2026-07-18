import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { estimateIllustratedBookCredits } from "@/lib/pricing";
import type { BookBilling, BookProject } from "@/types/printBook";

const DEFAULT_CREDITS = 3;

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

export function needsIllustratedBookReservation(project: BookProject) {
  return (
    project.billing?.product !== "illustrated_book" ||
    (project.billing.status !== "reserved" &&
      project.billing.status !== "captured")
  );
}

export async function reserveIllustratedBookCredits(project: BookProject) {
  if (!needsIllustratedBookReservation(project)) return project;

  const client = await clerkClient();
  const user = await client.users.getUser(project.userId);
  const isAdmin = user.privateMetadata.isAdmin === true;
  const currentCredits = getCredits(user.privateMetadata.credits);
  const now = new Date().toISOString();
  const estimate = estimateIllustratedBookCredits({
    ageBand: project.ageBand,
    pageCount: project.pageCount,
    illustrationCount: project.spreadCount,
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
