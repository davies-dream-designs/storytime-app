import { NextRequest, NextResponse } from "next/server";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";

// fal.ai webhook payload — delivered when a queued job completes or fails.
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
  const failed = body.status === "ERROR";
  const error = failed ? (body.error ?? "Kling failed") : null;

  console.log(
    `fal webhook: request_id=${body.request_id} status=${body.status}`,
    videoUrl ? `url=${videoUrl.slice(0, 60)}` : error
  );

  // Fire the Inngest event so the waiting generateBookVideo function resumes.
  await inngest.send({
    name: INNGEST_EVENTS.klingCompleted,
    data: {
      requestId: body.request_id,
      videoUrl,
      failed,
      error,
    },
  });

  return NextResponse.json({ received: true });
}
