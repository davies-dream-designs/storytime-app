import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sendShippedEmail, sendViaOutbox } from "@/lib/email";
import { logEvent } from "@/lib/logEvent";
import type { PrintFulfillment } from "@/types/printBook";

// Lulu does not HMAC-sign webhook payloads, so we authenticate the callback
// with a shared secret we control: the webhook is registered with a `token`
// query param (see admin/lulu/register-webhook) that must match
// LULU_WEBHOOK_TOKEN. When the env is unset we allow the call but log a warning,
// so deploying this code never breaks an already-registered (tokenless) webhook
// before the secret is configured and the webhook re-registered.
function isAuthenticLuluCallback(req: NextRequest): boolean {
  const expected = process.env.LULU_WEBHOOK_TOKEN;
  if (!expected) {
    console.warn(
      "LULU_WEBHOOK_TOKEN is not set; accepting Lulu webhook without authentication. Set it and re-register the webhook to enable verification."
    );
    return true;
  }
  const provided =
    req.nextUrl.searchParams.get("token") ??
    req.headers.get("x-storycot-webhook-token");
  return provided === expected;
}

/**
 * Owner (self-purchase) print orders never store the buyer's shipping details,
 * so the shipped-notification recipient is the account's own Clerk email.
 * Best-effort — returns undefined on any lookup failure.
 */
async function resolveOwnerEmail(
  userId: string
): Promise<string | undefined> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return (
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses?.[0]?.emailAddress ??
      undefined
    );
  } catch (err) {
    console.error("Lulu webhook: owner email lookup failed (non-fatal)", err);
    return undefined;
  }
}

// Lulu print job status → our fulfillment status mapping
function mapLuluStatus(luluStatus: string): PrintFulfillment["status"] | null {
  switch (luluStatus.toUpperCase()) {
    case "IN_PRODUCTION":
    case "PRODUCTION_DELAYED":
      return "submitted";
    case "SHIPPED":
      return "shipped";
    case "DELIVERED":
      return "delivered";
    case "REJECTED":
    case "CANCELLED":
      return "failed";
    default:
      return null;
  }
}

type LuluWebhookPayload = {
  event?: string;
  data?: {
    id?: unknown;
    external_id?: unknown;
    status?: { name?: unknown; changed_at?: unknown };
    line_items?: Array<{
      tracking_id?: unknown;
      tracking_urls?: unknown[];
      carrier?: unknown;
    }>;
  };
};

export async function POST(req: NextRequest) {
  if (!isAuthenticLuluCallback(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.text();

  let payload: LuluWebhookPayload;
  try {
    payload = JSON.parse(body) as LuluWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.event !== "print_job.status.changed") {
    // Acknowledge unhandled events without error
    return NextResponse.json({ received: true });
  }

  const data = payload.data;
  const luluStatusName =
    typeof data?.status?.name === "string" ? data.status.name : null;
  const externalId =
    typeof data?.external_id === "string" ? data.external_id : null;
  // Lulu's own print-job id. This is the value we persisted as
  // `fulfillment.externalOrderId` on submission, so it authenticates which of a
  // project's orders (owner copy vs any public buyer) this notification is for.
  const luluJobId = typeof data?.id === "string" ? data.id : null;

  if (!luluStatusName) {
    return NextResponse.json({ received: true });
  }

  const newStatus = mapLuluStatus(luluStatusName);
  if (!newStatus) {
    console.info("Lulu webhook: unhandled status", luluStatusName);
    return NextResponse.json({ received: true });
  }

  // Resolve project ID from external_id (set as "storycot-<projectId>" when submitting)
  const projectId = externalId?.startsWith("storycot-")
    ? externalId.slice("storycot-".length)
    : null;

  if (!projectId) {
    console.warn(
      "Lulu webhook: could not resolve project from external_id",
      externalId
    );
    return NextResponse.json({ received: true });
  }

  // Extract tracking info from first line item
  const lineItem = data?.line_items?.[0];
  const trackingUrl =
    typeof lineItem?.tracking_urls?.[0] === "string"
      ? lineItem.tracking_urls[0]
      : undefined;
  const carrier =
    typeof lineItem?.carrier === "string" ? lineItem.carrier : undefined;

  const applyStatus = (fulfillment: PrintFulfillment): PrintFulfillment => ({
    ...fulfillment,
    status: newStatus,
    externalStatus: luluStatusName,
    ...(newStatus === "shipped" || newStatus === "delivered"
      ? { shippedAt: fulfillment.shippedAt ?? new Date().toISOString() }
      : {}),
    ...(newStatus === "delivered"
      ? { deliveredAt: new Date().toISOString() }
      : {}),
    ...(trackingUrl ? { trackingUrl } : {}),
    ...(carrier ? { carrier } : {}),
  });

  // Candidate orders for this project: the owner copy (on the project) and any
  // public buyers (normalized print_orders). Match by the stored Lulu job id so
  // a public buyer's notification can never mutate the owner's (or another
  // buyer's) different order. Fall back to project-level match only when there
  // is exactly one candidate and we have no job id to disambiguate.
  const project = await db.bookProjects.getById(projectId);
  const publicOrders = await db.printOrders.getByProjectId(projectId);

  type Candidate =
    | { kind: "owner"; fulfillment: PrintFulfillment }
    | { kind: "public"; orderId: string; fulfillment: PrintFulfillment };
  const candidates: Candidate[] = [];
  if (project?.printOrder?.fulfillment) {
    candidates.push({ kind: "owner", fulfillment: project.printOrder.fulfillment });
  }
  for (const order of publicOrders) {
    if (order.fulfillment) {
      candidates.push({
        kind: "public",
        orderId: order.id,
        fulfillment: order.fulfillment,
      });
    }
  }

  const matched =
    (luluJobId &&
      candidates.find((c) => c.fulfillment.externalOrderId === luluJobId)) ||
    (candidates.length === 1 ? candidates[0] : undefined);

  if (!matched) {
    console.warn("Lulu webhook: no matching order for notification", {
      projectId,
      luluJobId,
      candidateCount: candidates.length,
    });
    return NextResponse.json({ received: true });
  }

  const updatedFulfillment = applyStatus(matched.fulfillment);
  let recipientEmail: string | undefined;
  let recipientName: string | undefined;
  let productLabel: string | undefined;
  let ownerUserId: string | undefined;

  if (matched.kind === "owner" && project?.printOrder) {
    await db.bookProjects.update(projectId, {
      printOrder: { ...project.printOrder, fulfillment: updatedFulfillment },
    });
    productLabel = project.printOrder.productLabel;
    ownerUserId = project.userId;
    // Owner orders intentionally never persist a shipping block, so recover the
    // account email from Clerk to send the shipped notification. Best-effort:
    // notification delivery must never break the webhook.
    recipientName = project.printOrder.shipping?.name;
    recipientEmail = project.printOrder.shipping?.email;
    if (!recipientEmail) {
      recipientEmail = await resolveOwnerEmail(project.userId);
    }
  } else if (matched.kind === "public") {
    const order = publicOrders.find((o) => o.id === matched.orderId);
    await db.printOrders.update(matched.orderId, {
      fulfillment: updatedFulfillment,
    });
    recipientEmail = order?.shipping?.email ?? order?.buyerEmail;
    recipientName = order?.shipping?.name;
    productLabel = order?.productLabel;
    ownerUserId = order?.buyerUserId;
  }

  console.info("Lulu webhook: updated fulfillment status", {
    projectId,
    orderKind: matched.kind,
    luluStatus: luluStatusName,
    ourStatus: newStatus,
  });

  if (newStatus === "failed") {
    await logEvent({
      code: "print.fulfillment_failed",
      message: `Lulu reported print job ${luluStatusName} for order ${externalId}`,
      userId: ownerUserId ?? null,
      userEmail: recipientEmail ?? null,
      entityType: "print_order",
      entityId: matched.kind === "public" ? matched.orderId : projectId,
      source: "lulu/webhook",
      context: { luluStatus: luluStatusName, externalId, luluJobId },
    });
  }

  if (newStatus === "shipped" && recipientEmail && project) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://storycot.com";
    const story = await db.stories.getById(project.sourceStoryId);
    // Durable + idempotent: keyed on the order so a webhook redelivery never
    // sends the shipped email twice, and a failed send is recorded (not lost).
    const dedupeKey = `shipped:${matched.kind}:${
      matched.kind === "public" ? matched.orderId : projectId
    }`;
    await sendViaOutbox(
      { dedupeKey, kind: "shipped", recipient: recipientEmail },
      () =>
        sendShippedEmail({
          toEmail: recipientEmail,
          toName: recipientName ?? "there",
          storyTitle: story?.title ?? "Your story",
          productLabel: productLabel ?? "Storycot book",
          trackingUrl,
          carrier,
          trackUrl: `${appUrl}/stories/${project.sourceStoryId}`,
          appUrl,
        })
    ).catch((err) => console.error("Shipped email failed (non-fatal)", err));
  }

  return NextResponse.json({ received: true });
}
