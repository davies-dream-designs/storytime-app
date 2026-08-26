import { NextRequest } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { STORY_CREDIT_COST } from "@/lib/pricing";
import { logEvent } from "@/lib/logEvent";
import { storyRatelimit, checkRatelimit } from "@/lib/ratelimit";
import {
  runStoryGeneration,
  readStorySnapshot,
  type StorySnapshotState,
} from "@/lib/stories/runGeneration";

function sendEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: string,
  data: unknown
) {
  const encoder = new TextEncoder();
  try {
    controller.enqueue(
      encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    );
  } catch {
    // Controller is already closed (client disconnected); nothing to send.
  }
}

function safeClose(controller: ReadableStreamDefaultController<Uint8Array>) {
  try {
    controller.close();
  } catch {
    // Already closed.
  }
}

function relaySnapshot(
  controller: ReadableStreamDefaultController<Uint8Array>,
  state: StorySnapshotState
) {
  if (state.stage) {
    sendEvent(controller, "status", { status: state.stage });
  }
  if (state.pages.length > 0) {
    sendEvent(controller, "snapshot", { pages: state.pages });
  }
}

/**
 * Observer path: another generator (a second tab or the durable Inngest job)
 * already owns this story. Relay KV snapshots and poll the DB until the story
 * reaches a terminal state, so this client still sees live progress and the
 * final result without running a second generation.
 */
async function observeGeneration(
  controller: ReadableStreamDefaultController<Uint8Array>,
  storyId: string,
  signal: AbortSignal
) {
  const deadline = Date.now() + 5 * 60 * 1000;
  while (!signal.aborted && Date.now() < deadline) {
    const snapshot = await readStorySnapshot(storyId);
    if (snapshot) relaySnapshot(controller, snapshot);

    const current = await db.stories.getById(storyId);
    if (current?.status === "ready") {
      sendEvent(controller, "complete", current);
      return;
    }
    if (current?.status === "failed") {
      sendEvent(controller, "error", {
        error: current.generationError ?? "Story generation failed",
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const story = await db.stories.getById(id);
  if (!story || story.userId !== userId) {
    return new Response("Story not found", { status: 404 });
  }

  if (story.status === "ready") {
    return Response.json(story);
  }

  const rateLimitRes = await checkRatelimit(storyRatelimit, userId);
  if (rateLimitRes) return rateLimitRes;

  if (!process.env.ANTHROPIC_API_KEY) {
    await db.stories.update(id, {
      status: "failed",
      generationError: "ANTHROPIC_API_KEY not configured",
    });
    await logEvent({
      code: "story.config_missing",
      message: "ANTHROPIC_API_KEY not configured",
      userId,
      entityType: "story",
      entityId: id,
      source: "story/stream",
    });
    return new Response("ANTHROPIC_API_KEY not configured", { status: 503 });
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const isAdmin = user.privateMetadata.isAdmin === true;
  const credits = (user.privateMetadata.credits as number | undefined) ?? 3;

  if (!isAdmin && credits < STORY_CREDIT_COST && !story.creditChargedAt) {
    await db.stories.update(id, {
      status: "failed",
      generationError: "You're out of credits. Visit your account to top up.",
    });
    return new Response("No credits remaining", { status: 402 });
  }

  const locale = req.nextUrl.searchParams.get("locale") ?? undefined;

  // Atomically claim this story so a second tab or the durable Inngest fallback
  // never generates (and double-charges) in parallel. If the claim fails, this
  // request becomes a read-only observer of the owning generator's progress.
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
  const claimed = await db.stories.claimGeneration(
    id,
    `stream:${now.getTime()}`,
    now.toISOString(),
    staleBefore
  );

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!claimed) {
          await observeGeneration(controller, id, req.signal);
          safeClose(controller);
          return;
        }

        sendEvent(controller, "status", { status: "starting" });
        const result = await runStoryGeneration(id, {
          locale,
          onSnapshot: (state) => relaySnapshot(controller, state),
        });

        if (result.status === "ready" && result.story) {
          sendEvent(controller, "complete", result.story);
        } else if (result.status === "failed") {
          sendEvent(controller, "error", {
            error: result.error ?? "Story generation failed",
          });
        }
        safeClose(controller);
      } catch (err) {
        // If the client navigated away, the durable Inngest fallback still owns
        // completion, so don't surface a noisy error.
        if (req.signal.aborted) {
          safeClose(controller);
          return;
        }
        await logEvent({
          error: err,
          fallbackCode: "story.generation_failed",
          userId,
          userEmail: user.primaryEmailAddress?.emailAddress ?? null,
          entityType: "story",
          entityId: id,
          source: "story/stream",
          context: { theme: story.theme, profileId: story.profileId },
        });
        sendEvent(controller, "error", {
          error:
            err instanceof Error ? err.message : "Story generation failed",
        });
        safeClose(controller);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}
