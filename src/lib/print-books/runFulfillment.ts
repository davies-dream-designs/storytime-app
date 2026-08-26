import Stripe from "stripe";
import { db } from "@/lib/db";
import { submitPrintFulfillment } from "@/lib/print-books/fulfillment";
import { retrieveCheckoutShipping } from "@/lib/stripe/checkoutShipping";
import { logEvent } from "@/lib/logEvent";
import type {
  PrintBookOrder,
  PrintFulfillment,
  PrintOrderRecord,
} from "@/types/printBook";

export interface RunPrintFulfillmentResult {
  status: "submitted" | "pending" | "failed" | "skipped";
  reason?: string;
}

function centsToAud(value: number): number {
  return Number((value / 100).toFixed(2));
}

function withoutStoredFulfillmentPayload(
  fulfillment: PrintFulfillment
): PrintFulfillment {
  const safe = { ...fulfillment };
  delete safe.payload;
  return safe;
}

function withoutStoredShipping(order: PrintBookOrder): PrintBookOrder {
  const safe = { ...order };
  delete safe.shipping;
  return safe;
}

function fulfillmentStatusToPrintOrderStatus(
  fulfillment: PrintFulfillment
): PrintOrderRecord["status"] {
  switch (fulfillment.status) {
    case "submitted":
      return "fulfillment_submitted";
    case "shipped":
      return "shipped";
    case "delivered":
      return "delivered";
    case "failed":
    case "not_configured":
      return "failed";
    case "ready_for_manual_review":
      return "fulfillment_pending";
  }
}

function recordToBookOrder(order: PrintOrderRecord): PrintBookOrder {
  return {
    productKey: order.productKey,
    productLabel: order.productLabel,
    provider: order.provider === "lulu" ? "Lulu" : order.provider,
    format: order.format,
    status: "paid",
    amountAud: centsToAud(order.amountAudCents),
    subtotalAud: centsToAud(order.subtotalAudCents),
    shippingAmountAud: centsToAud(order.shippingAudCents),
    pageCount: order.pageCount,
    quantity: order.quantity,
    checkoutSessionId: order.checkoutSessionId,
    paymentIntentId: order.paymentIntentId,
    billingCountry: order.billingCountry,
    shipping: order.shipping,
    paidAt: order.paidAt ?? new Date().toISOString(),
  };
}

function resultFromFulfillment(
  fulfillment: PrintFulfillment
): RunPrintFulfillmentResult {
  switch (fulfillment.status) {
    case "submitted":
    case "shipped":
    case "delivered":
      return { status: "submitted" };
    case "ready_for_manual_review":
      return { status: "pending", reason: fulfillment.message };
    default:
      return { status: "failed", reason: fulfillment.message };
  }
}

/**
 * Submits a paid public print order to Lulu and persists the outcome. Safe to
 * retry: an order that already has an external Lulu order id is never
 * resubmitted, so duplicate events (Stripe redelivery, Inngest retries) can't
 * double-print.
 *
 * Works purely from the stored order/project state (the Stripe session is
 * parsed and persisted by the webhook first), so it can run durably in the
 * background, decoupled from the webhook request lifecycle.
 */
export async function runPublicPrintFulfillment(
  orderId: string
): Promise<RunPrintFulfillmentResult> {
  const order = await db.printOrders.getById(orderId);
  if (!order) return { status: "skipped", reason: "order not found" };
  if (order.fulfillment?.externalOrderId) {
    return { status: "skipped", reason: "already submitted" };
  }
  const project = await db.bookProjects.getById(order.projectId);
  if (!project || project.sourceStoryId !== order.storyId) {
    return { status: "skipped", reason: "project mismatch" };
  }

  const fulfillment = await submitPrintFulfillment({
    project,
    order: recordToBookOrder(order),
  });
  await db.printOrders.update(order.id, {
    status: fulfillmentStatusToPrintOrderStatus(fulfillment),
    fulfillment: withoutStoredFulfillmentPayload(fulfillment),
    updatedAt: new Date().toISOString(),
  });
  return resultFromFulfillment(fulfillment);
}

/**
 * Submits a paid owner-copy print order (project.printOrder) to Lulu.
 *
 * The owner path intentionally never persists the buyer's shipping address, so
 * this job re-fetches it from the Stripe Checkout Session on demand (Stripe is
 * the payment processor and the legitimate store for it). The address only ever
 * exists transiently in memory here; nothing is written to our database.
 *
 * Idempotent: a project whose printOrder already carries an external Lulu order
 * id is never resubmitted, so Stripe redelivery / Inngest retries can't
 * double-print.
 */
export async function runOwnerPrintFulfillment(
  projectId: string
): Promise<RunPrintFulfillmentResult> {
  const project = await db.bookProjects.getById(projectId);
  if (!project) return { status: "skipped", reason: "project not found" };

  const stored = project.printOrder;
  if (!stored || stored.status !== "paid") {
    return { status: "skipped", reason: "no paid print order" };
  }
  if (stored.fulfillment?.externalOrderId) {
    return { status: "skipped", reason: "already submitted" };
  }
  if (!stored.checkoutSessionId) {
    return { status: "skipped", reason: "missing checkout session" };
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  const { billingCountry, shipping } = await retrieveCheckoutShipping(
    stripe,
    stored.checkoutSessionId
  );
  if (!shipping) {
    // Cannot build a Lulu order without a deliverable address; surface for
    // manual handling rather than silently dropping a paid order.
    void logEvent({
      code: "print.shipping_missing",
      entityType: "book",
      entityId: project.id,
      source: "print-books/runFulfillment",
      context: { checkoutSessionId: stored.checkoutSessionId },
    });
    return { status: "failed", reason: "shipping unavailable from Stripe" };
  }

  const order: PrintBookOrder = {
    ...stored,
    billingCountry: billingCountry ?? stored.billingCountry,
    shipping,
  };
  const fulfillment = await submitPrintFulfillment({ project, order });
  await db.bookProjects.update(project.id, {
    printOrder: {
      ...withoutStoredShipping(order),
      fulfillment: withoutStoredFulfillmentPayload(fulfillment),
    },
  });
  return resultFromFulfillment(fulfillment);
}
