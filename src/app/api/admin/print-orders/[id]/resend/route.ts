import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { submitPrintFulfillment } from "@/lib/print-books/fulfillment";

async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) return false;

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return user.privateMetadata.isAdmin === true;
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

  const fulfillment = await submitPrintFulfillment({
    project,
    order: printOrder,
  });

  const updated = await db.bookProjects.update(project.id, {
    printOrder: {
      ...printOrder,
      fulfillment,
    },
  });

  return NextResponse.json({
    id: project.id,
    printOrder: updated?.printOrder,
  });
}
