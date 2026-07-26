import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getLuluAccessToken } from "@/lib/print-books/lulu";

type LuluWebhookEntry = {
  id?: unknown;
  url?: unknown;
  is_active?: unknown;
  topics?: unknown;
};

function getLuluBaseUrl() {
  return (process.env.LULU_API_BASE_URL ?? "https://api.lulu.com").replace(
    /\/$/,
    ""
  );
}

async function readLuluResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractLuluWebhooks(body: unknown): LuluWebhookEntry[] {
  if (Array.isArray(body)) return body as LuluWebhookEntry[];
  if (!body || typeof body !== "object") return [];

  for (const key of ["results", "webhooks", "data", "items"]) {
    const value = (body as Record<string, unknown>)[key];
    if (Array.isArray(value)) return value as LuluWebhookEntry[];
  }

  return [];
}

function luluErrorDetail(body: unknown) {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return "No response body";
  if ("detail" in body && typeof body.detail === "string") return body.detail;
  if ("message" in body && typeof body.message === "string")
    return body.message;
  if ("error" in body && typeof body.error === "string") return body.error;
  return JSON.stringify(body);
}

function normalizeWebhook(entry: LuluWebhookEntry) {
  return {
    id: typeof entry.id === "string" ? entry.id : "",
    url: typeof entry.url === "string" ? entry.url : "",
    is_active: entry.is_active === true,
    topics: Array.isArray(entry.topics)
      ? entry.topics.filter(
          (topic): topic is string => typeof topic === "string"
        )
      : [],
  };
}

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
  const luluBase = getLuluBaseUrl();

  try {
    const token = await getLuluAccessToken();

    const listRes = await fetch(`${luluBase}/webhooks/`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    const listBody = await readLuluResponse(listRes);
    if (!listRes.ok) {
      return NextResponse.json(
        {
          error: "Lulu webhook list failed",
          detail: luluErrorDetail(listBody),
          status: listRes.status,
        },
        { status: 502 }
      );
    }

    const existing = extractLuluWebhooks(listBody).map(normalizeWebhook);
    const alreadyRegistered = existing.some((w) => w.url === webhookUrl);

    if (alreadyRegistered) {
      return NextResponse.json({
        status: "already_registered",
        webhookUrl,
        webhooks: existing,
      });
    }

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

    const result = await readLuluResponse(regRes);
    if (!regRes.ok) {
      return NextResponse.json(
        {
          error: "Lulu registration failed",
          detail: luluErrorDetail(result),
          status: regRes.status,
        },
        { status: 502 }
      );
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

  const luluBase = getLuluBaseUrl();

  try {
    const token = await getLuluAccessToken();
    const res = await fetch(`${luluBase}/webhooks/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await readLuluResponse(res);
    if (!res.ok) {
      return NextResponse.json(
        {
          error: "Lulu webhook list failed",
          detail: luluErrorDetail(data),
          status: res.status,
        },
        { status: 502 }
      );
    }
    return NextResponse.json({
      webhooks: extractLuluWebhooks(data).map(normalizeWebhook),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
