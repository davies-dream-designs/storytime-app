import type {
  BookProject,
  PrintBookOrder,
  PrintFulfillment,
  PrintShippingAddress,
} from "@/types/printBook";

type FulfillmentProvider = PrintFulfillment["provider"];

function getFulfillmentProvider(): FulfillmentProvider {
  return process.env.STORYCOT_PRINT_PROVIDER === "peecho"
    ? "peecho"
    : "prodigi";
}

function getProdigiSku(productKey: PrintBookOrder["productKey"]) {
  switch (productKey) {
    case "softcover":
      return process.env.STORYCOT_PRODIGI_SOFTCOVER_SKU;
    case "hardcover":
      return process.env.STORYCOT_PRODIGI_HARDCOVER_SKU;
    case "layflat":
      return process.env.STORYCOT_PRODIGI_LAYFLAT_SKU;
  }
}

function getPeechoOfferingId(productKey: PrintBookOrder["productKey"]) {
  switch (productKey) {
    case "softcover":
      return process.env.STORYCOT_PEECHO_SOFTCOVER_OFFERING_ID;
    case "hardcover":
      return process.env.STORYCOT_PEECHO_HARDCOVER_OFFERING_ID;
    case "layflat":
      return process.env.STORYCOT_PEECHO_LAYFLAT_OFFERING_ID;
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

function buildProdigiPayload(input: {
  project: BookProject;
  order: PrintBookOrder;
  shipping: PrintShippingAddress;
}) {
  const { project, order, shipping } = input;
  const sku = getProdigiSku(order.productKey);
  if (!sku) {
    throw new Error(
      `Prodigi SKU is not configured for ${order.productKey}. Set STORYCOT_PRODIGI_${order.productKey.toUpperCase()}_SKU.`
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
    merchantReference: `storycot-${project.id}`,
    shippingMethod: "Standard",
    idempotencyKey: order.checkoutSessionId ?? `storycot-${project.id}`,
    recipient: {
      name: shipping.name ?? "Storycot customer",
      email: shipping.email,
      phoneNumber: shipping.phone,
      address: {
        line1: shipping.line1,
        line2: shipping.line2 ?? null,
        postalOrZipCode: shipping.postalCode,
        countryCode: "AU",
        townOrCity: shipping.city,
        stateOrCounty: shipping.state ?? null,
      },
    },
    items: [
      {
        merchantReference: `${project.id}-${order.productKey}`,
        sku,
        copies: 1,
        sizing: "fitPrintArea",
        recipientCost: {
          amount: order.amountAud.toFixed(2),
          currency: "AUD",
        },
        assets: [
          {
            printArea: "default",
            url: printPdfUrl,
            pageCount: order.pageCount,
          },
          {
            printArea: "cover",
            url: coverPdfUrl,
          },
        ],
      },
    ],
    metadata: {
      source: "storycot",
      projectId: project.id,
      sourceStoryId: project.sourceStoryId,
      productKey: order.productKey,
      checkoutSessionId: order.checkoutSessionId,
    },
  };
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
        quantity: 1,
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
        : buildProdigiPayload({ ...input, shipping });

    return {
      provider,
      status: "ready_for_manual_review",
      preparedAt: new Date().toISOString(),
      message:
        "Supplier order payload is prepared. Manual review is required before manufacturing submission.",
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
