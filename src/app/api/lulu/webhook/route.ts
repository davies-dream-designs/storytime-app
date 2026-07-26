import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendShippedEmail } from "@/lib/email";
import { logEvent } from "@/lib/logEvent";
import type { PrintFulfillment } from "@/types/printBook";

// Lulu does not sign webhook payloads — no secret verification needed.

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
  const luluStatusName = typeof data?.status?.name === "string" ? data.status.name : null;
  const externalId = typeof data?.external_id === "string" ? data.external_id : null;

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
    console.warn("Lulu webhook: could not resolve project from external_id", externalId);
    return NextResponse.json({ received: true });
  }

  const project = await db.bookProjects.getById(projectId);
  if (!project?.printOrder?.fulfillment) {
    console.warn("Lulu webhook: project or fulfillment not found", projectId);
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
  const externalStatus = luluStatusName;

  const updatedFulfillment: PrintFulfillment = {
    ...project.printOrder.fulfillment,
    status: newStatus,
    externalStatus,
    ...(newStatus === "shipped" || newStatus === "delivered"
      ? { shippedAt: project.printOrder.fulfillment.shippedAt ?? new Date().toISOString() }
      : {}),
    ...(newStatus === "delivered"
      ? { deliveredAt: new Date().toISOString() }
      : {}),
    ...(trackingUrl ? { trackingUrl } : {}),
    ...(carrier ? { carrier } : {}),
  };

  await db.bookProjects.update(projectId, {
    printOrder: {
      ...project.printOrder,
      fulfillment: updatedFulfillment,
    },
  });

  console.info("Lulu webhook: updated fulfillment status", {
    projectId,
    luluStatus: luluStatusName,
    ourStatus: newStatus,
  });

  // A rejected/cancelled print job means a paying customer's order won't ship —
  // surface it as a high-priority issue in the admin panel.
  if (newStatus === "failed") {
    await logEvent({
      code: "print.fulfillment_failed",
      message: `Lulu reported print job ${luluStatusName} for order ${externalId}`,
      userId: project.userId,
      userEmail: project.printOrder.shipping?.email ?? null,
      entityType: "print_order",
      entityId: projectId,
      source: "lulu/webhook",
      context: { luluStatus: luluStatusName, externalId },
    });
  }

  // Send shipped notification email (fire-and-forget)
  if (newStatus === "shipped") {
    const customerEmail = project.printOrder.shipping?.email;
    if (customerEmail) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://storycot.com";
      const story = await db.stories.getById(project.sourceStoryId);
      void sendShippedEmail({
        toEmail: customerEmail,
        toName: project.printOrder.shipping?.name ?? "there",
        storyTitle: story?.title ?? "Your story",
        productLabel: project.printOrder.productLabel,
        trackingUrl,
        carrier,
        trackUrl: `${appUrl}/stories/${project.sourceStoryId}`,
        appUrl,
      }).catch((err) => console.error("Shipped email failed (non-fatal)", err));
    }
  }

  return NextResponse.json({ received: true });
}
