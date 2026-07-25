import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getLuluAccessToken } from "@/lib/print-books/lulu";

export async function POST() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user.privateMetadata.isAdmin !== true)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://storycot.com";
  const webhookUrl = `${appUrl}/api/lulu/webhook`;
  const luluBase = (process.env.LULU_API_BASE_URL ?? "https://api.lulu.com").replace(/\/$/, "");

  try {
    const token = await getLuluAccessToken();

    // Check existing webhooks first
    const listRes = await fetch(`${luluBase}/webhooks/`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    const existing = (await listRes.json()) as Array<{ id: string; url: string; is_active: boolean; topics: string[] }>;
    const alreadyRegistered = Array.isArray(existing) && existing.some((w) => w.url === webhookUrl);

    if (alreadyRegistered) {
      return NextResponse.json({ status: "already_registered", webhookUrl, existing });
    }

    // Register
    const regRes = await fetch(`${luluBase}/webhooks/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify({
        topics: ["PRINT_JOB_STATUS_CHANGED"],
        url: webhookUrl,
      }),
    });

    const result = await regRes.json();
    if (!regRes.ok) {
      return NextResponse.json({ error: "Lulu registration failed", detail: result }, { status: 502 });
    }

    return NextResponse.json({ status: "registered", webhookUrl, result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user.privateMetadata.isAdmin !== true)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const luluBase = (process.env.LULU_API_BASE_URL ?? "https://api.lulu.com").replace(/\/$/, "");

  try {
    const token = await getLuluAccessToken();
    const res = await fetch(`${luluBase}/webhooks/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return NextResponse.json({ webhooks: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
