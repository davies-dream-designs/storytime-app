import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { db } from "@/lib/db";

type FalWebhookBody = {
  request_id: string;
  status: "OK" | "ERROR";
  payload: { video?: { url?: string } } | null;
  error: string | null;
};

export async function POST(req: NextRequest) {
  let body: FalWebhookBody;
  try {
    body = (await req.json()) as FalWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.request_id) {
    return NextResponse.json({ error: "Missing request_id" }, { status: 400 });
  }

  const videoUrl = body.status === "OK" ? (body.payload?.video?.url ?? null) : null;
  console.log(`fal webhook: ${body.request_id} status=${body.status}`, videoUrl ? "✓" : body.error);

  if (!videoUrl) {
    // Failed job — nothing to store, Inngest fallback poll will handle it.
    return NextResponse.json({ received: true });
  }

  // Look up which project/spread this belongs to.
  const meta = await kv.get<{ projectId: string; spreadId: string }>(
    `klingJob:${body.request_id}`
  );

  if (!meta) {
    console.warn(`fal webhook: no KV entry for request_id ${body.request_id}`);
    return NextResponse.json({ received: true });
  }

  const { projectId, spreadId } = meta;

  // Write the video URL directly to the spread — no Inngest event needed.
  // The Inngest function will read this from DB after its sleep.
  const project = await db.bookProjects.getById(projectId);
  if (project) {
    const updatedSpreads = project.spreads.map((s) =>
      s.id === spreadId ? { ...s, leftPageVideoUrl: videoUrl } : s
    );
    await db.bookProjects.update(projectId, { spreads: updatedSpreads });
    console.log(`fal webhook: stored videoUrl for spread ${spreadId} in project ${projectId}`);
  }

  return NextResponse.json({ received: true });
}
