import type {
  BookProject,
  PrintBookOrder,
  PrintFulfillment,
  PrintShippingAddress,
} from "@/types/printBook";
import {
  buildLuluPrintJobPayload,
  getLuluCoverPdfUrlForProduct,
  submitLuluPrintJob,
} from "@/lib/print-books/lulu";
import { logEvent } from "@/lib/logEvent";

type FulfillmentProvider = PrintFulfillment["provider"];

function getFulfillmentProvider(): FulfillmentProvider {
  if (process.env.STORYCOT_PRINT_PROVIDER === "peecho") return "peecho";
  return "lulu";
}

function getPeechoOfferingId(productKey: PrintBookOrder["productKey"]) {
  switch (productKey) {
    case "hardcover":
      return process.env.STORYCOT_PEECHO_HARDCOVER_OFFERING_ID;
  }
}

function assertPublicAssetUrl(value: string | undefined, label: string) {
  if (!value) throw new Error(`${label} is missing.`);
  if (value.startsWith("data:")) {
    throw new Error(
      `${label} is inline fallback data. Blob storage must create a public URL before fulfilment.`
    );
  }
  return value;
}

function buildPeechoPayload(input: {
  project: BookProject;
  order: PrintBookOrder;
  shipping: PrintShippingAddress;
}) {
  const { project, order, shipping } = input;
  const offeringId = getPeechoOfferingId(order.productKey);
  if (!offeringId) {
    throw new Error(
      `Peecho offering ID is not configured for ${order.productKey}. Set STORYCOT_PEECHO_${order.productKey.toUpperCase()}_OFFERING_ID.`
    );
  }

  const printPdfUrl = assertPublicAssetUrl(
    project.assets.printPdfUrl,
    "Interior print PDF"
  );
  const coverPdfUrl = assertPublicAssetUrl(
    project.assets.coverPdfUrl,
    "Cover PDF"
  );

  return {
    purchase_order: `storycot-${project.id}`,
    currency: "AUD",
    item_details: [
      {
        item_reference: `${project.id}-${order.productKey}`,
        offering_id: Number(offeringId),
        quantity: order.quantity ?? 1,
        file_details: {
          content_url: printPdfUrl,
          content_width: 210,
          content_height: 210,
          number_of_pages: order.pageCount,
          spine_details: {
            custom_spine_url: coverPdfUrl,
          },
        },
      },
    ],
    address_details: {
      email_address: shipping.email,
      shipping_address: {
        first_name: shipping.name?.split(/\s+/)[0] ?? "Storycot",
        last_name: shipping.name?.split(/\s+/).slice(1).join(" ") || "Customer",
        address_line_1: shipping.line1,
        address_line_2: shipping.line2 ?? "",
        zip_code: shipping.postalCode,
        city: shipping.city,
        state: shipping.state ?? null,
        country_code: "AUS",
      },
    },
    metadata: {
      source: "storycot",
      projectId: project.id,
      checkoutSessionId: order.checkoutSessionId,
    },
  };
}

export function preparePrintFulfillment(input: {
  project: BookProject;
  order: PrintBookOrder;
}): PrintFulfillment {
  const provider = getFulfillmentProvider();
  const shipping = input.order.shipping;

  if (!shipping) {
    return {
      provider,
      status: "not_configured",
      preparedAt: new Date().toISOString(),
      message: "Shipping address is missing from the Stripe checkout session.",
    };
  }

  try {
    const payload =
      provider === "peecho"
        ? buildPeechoPayload({ ...input, shipping })
        : buildLuluPrintJobPayload({ ...input, shipping });

    return {
      provider,
      status: "ready_for_manual_review",
      preparedAt: new Date().toISOString(),
      payload,
    };
  } catch (error) {
    return {
      provider,
      status: "not_configured",
      preparedAt: new Date().toISOString(),
      message:
        error instanceof Error
          ? error.message
          : "Print fulfilment is not configured.",
    };
  }
}

/**
 * Generates the paperback/coil cover PDF just-in-time if this is the first
 * order of that format for this book, returning a project with the cover
 * URL populated. No-op for hardcover (still built eagerly at book-build
 * time) and for an already-cached flat cover.
 */
async function ensureLuluCoverReady(
  project: BookProject,
  order: PrintBookOrder
): Promise<BookProject> {
  if (order.productKey === "hardcover") return project;
  if (getLuluCoverPdfUrlForProduct(project, order.productKey)) return project;

  const { db } = await import("@/lib/db");
  const [story, profile] = await Promise.all([
    db.stories.getById(project.sourceStoryId),
    db.profiles.getById(project.profileId),
  ]);
  if (!story || !profile) {
    throw new Error(
      `Cannot generate ${order.productKey} cover PDF: source story or profile is missing.`
    );
  }

  const { getOrCreateLuluCoverPdfUrl } = await import(
    "@/lib/print-books/lazyCovers"
  );
  await getOrCreateLuluCoverPdfUrl({
    project,
    story,
    profile,
    productKey: order.productKey,
  });

  // Re-fetch: getOrCreateLuluCoverPdfUrl persisted the new cover URL onto
  // the project's assets in the database.
  const refreshed = await db.bookProjects.getById(project.id);
  return refreshed ?? project;
}

export async function submitPrintFulfillment(input: {
  project: BookProject;
  order: PrintBookOrder;
}): Promise<PrintFulfillment> {
  const provider = getFulfillmentProvider();

  let project = input.project;
  if (provider === "lulu") {
    try {
      project = await ensureLuluCoverReady(input.project, input.order);
    } catch (error) {
      // Route through the same structured failure path as every other
      // preparePrintFulfillment error (logged + a retryable "not_configured"
      // status) rather than throwing here and skipping logging/status
      // updates in the caller (runFulfillment.ts never expects
      // submitPrintFulfillment itself to reject).
      const fulfillment: PrintFulfillment = {
        provider,
        status: "not_configured",
        preparedAt: new Date().toISOString(),
        message:
          error instanceof Error
            ? error.message
            : "Failed to generate the Lulu cover PDF for this format.",
      };
      await logEvent({
        code: "print.fulfillment_config_missing",
        message: fulfillment.message,
        userId: input.project.userId,
        userEmail: input.order.shipping?.email ?? null,
        entityType: "print_order",
        entityId: input.project.id,
        source: "print/fulfillment",
        context: { productKey: input.order.productKey, provider },
      });
      return fulfillment;
    }
  }

  const fulfillment = preparePrintFulfillment({ ...input, project });

  if (
    fulfillment.status !== "ready_for_manual_review" ||
    !fulfillment.payload
  ) {
    console.warn("Print fulfillment not ready for submission", {
      projectId: input.project.id,
      productKey: input.order.productKey,
      provider: fulfillment.provider,
      status: fulfillment.status,
      message: fulfillment.message,
    });
    await logEvent({
      code: fulfillment.message?.toLowerCase().includes("shipping")
        ? "print.shipping_missing"
        : "print.fulfillment_config_missing",
      message:
        fulfillment.message ?? "Print fulfillment not ready for submission",
      userId: input.project.userId,
      userEmail: input.order.shipping?.email ?? null,
      entityType: "print_order",
      entityId: input.project.id,
      source: "print/fulfillment",
      context: {
        productKey: input.order.productKey,
        provider: fulfillment.provider,
        status: fulfillment.status,
      },
    });
    return fulfillment;
  }

  try {
    const { orderId, externalStatus } = await submitLuluPrintJob(
      fulfillment.payload
    );
    console.info("Print fulfillment submitted", {
      projectId: input.project.id,
      productKey: input.order.productKey,
      provider: fulfillment.provider,
      externalOrderId: orderId,
      externalStatus,
    });
    return {
      ...fulfillment,
      status: "submitted",
      submittedAt: new Date().toISOString(),
      externalOrderId: orderId,
      externalStatus,
      message: `Order ${orderId} submitted to Lulu.`,
      payload: undefined,
    };
  } catch (error) {
    console.error("Print fulfillment submission failed", {
      projectId: input.project.id,
      productKey: input.order.productKey,
      provider: fulfillment.provider,
      error: error instanceof Error ? error.message : String(error),
    });
    await logEvent({
      error,
      code: "print.fulfillment_failed",
      userId: input.project.userId,
      userEmail: input.order.shipping?.email ?? null,
      entityType: "print_order",
      entityId: input.project.id,
      source: "print/fulfillment",
      context: {
        productKey: input.order.productKey,
        provider: fulfillment.provider,
        amountAud: input.order.amountAud,
      },
    });
    return {
      ...fulfillment,
      status: "failed",
      message:
        error instanceof Error ? error.message : "Lulu submission failed.",
    };
  }
}
