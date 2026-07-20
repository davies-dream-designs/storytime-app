import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { submitPrintFulfillment } from "@/lib/print-books/fulfillment";
import { retrieveCheckoutShipping } from "@/lib/stripe/checkoutShipping";
import type { PrintBookOrder } from "@/types/printBook";

async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) return false;

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return user.privateMetadata.isAdmin === true;
}

async function hydrateMissingShipping(
  printOrder: PrintBookOrder
): Promise<PrintBookOrder> {
  if (printOrder.shipping) return printOrder;
  if (!printOrder.checkoutSessionId || !process.env.STRIPE_SECRET_KEY) {
    return printOrder;
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const { billingCountry, shipping } = await retrieveCheckoutShipping(
    stripe,
    printOrder.checkoutSessionId
  );

  return {
    ...printOrder,
    billingCountry: billingCountry ?? printOrder.billingCountry,
    shipping,
  };
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const project = await db.bookProjects.getById(id);
  if (!project) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const printOrder = project.printOrder;
  if (!printOrder || printOrder.status !== "paid") {
    return NextResponse.json(
      { error: "This book does not have a paid print order." },
      { status: 409 }
    );
  }

  if (printOrder.fulfillment?.status === "submitted") {
    return NextResponse.json(
      {
        error: "This print order has already been submitted.",
        fulfillment: printOrder.fulfillment,
      },
      { status: 409 }
    );
  }

  const orderForFulfillment = await hydrateMissingShipping(printOrder);
  const fulfillment = await submitPrintFulfillment({
    project,
    order: orderForFulfillment,
  });

  const updated = await db.bookProjects.update(project.id, {
    printOrder: {
      ...orderForFulfillment,
      fulfillment,
    },
  });

  return NextResponse.json({
    id: project.id,
    printOrder: updated?.printOrder,
  });
}
