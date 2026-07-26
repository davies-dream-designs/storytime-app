import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getAdminIdentity } from "@/lib/adminAuth";
import { getUserCredits } from "@/lib/credits";

/**
 * Look up everything about one customer from a single query string: an email, a
 * Clerk user id, or a story/book id. Returns their profile, credits, stories,
 * books, print orders and recent errors — the "someone rang up" screen.
 */
export async function GET(req: NextRequest) {
  if (!(await getAdminIdentity())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "Provide a `q` query." }, { status: 400 });
  }

  const client = await clerkClient();
  let userId: string | null = null;

  if (q.includes("@")) {
    const list = await client.users.getUserList({ emailAddress: [q], limit: 1 });
    userId = list.data[0]?.id ?? null;
  } else if (q.startsWith("user_")) {
    userId = q;
  } else {
    // Try to resolve a story or book id back to its owner.
    const [story, book] = await Promise.all([
      db.stories.getById(q).catch(() => undefined),
      db.bookProjects.getById(q).catch(() => undefined),
    ]);
    userId = story?.userId ?? book?.userId ?? null;
  }

  if (!userId) {
    return NextResponse.json({ found: false, query: q });
  }

  const user = await client.users.getUser(userId).catch(() => null);
  const [{ credits }, stories, books, errors] = await Promise.all([
    getUserCredits(userId).catch(() => ({ credits: 0, isAdmin: false })),
    db.stories.getByUserId(userId),
    db.bookProjects.getByUserId(userId),
    db.errorEvents.list({ userId, limit: 25 }),
  ]);

  return NextResponse.json({
    found: true,
    query: q,
    user: {
      id: userId,
      email: user?.primaryEmailAddress?.emailAddress ?? null,
      name:
        [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null,
      credits,
      isAdmin: user?.privateMetadata.isAdmin === true,
    },
    stories: stories.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status ?? "ready",
      generationError: s.generationError ?? null,
      createdAt: s.createdAt,
    })),
    books: books.map((b) => ({
      id: b.id,
      sourceStoryId: b.sourceStoryId,
      status: b.status,
      errorCode: b.errorCode ?? null,
      errorMessage: b.errorMessage ?? null,
      printOrder: b.printOrder
        ? {
            status: b.printOrder.status,
            productLabel: b.printOrder.productLabel,
            amountAud: b.printOrder.amountAud,
            fulfillmentStatus: b.printOrder.fulfillment?.status ?? null,
          }
        : null,
      updatedAt: b.updatedAt,
    })),
    errors,
  });
}
