import { clerkClient } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { db } from "@/lib/db";
import { STORY_CREDIT_COST } from "@/lib/pricing";
import { StoryGenerationError, streamStory } from "@/lib/storyGenerator";
import {
  assessGeneratedStoryIp,
  assessProfileIp,
  profileIpErrorResponse,
} from "@/lib/ipGuardrails";
import { logEvent } from "@/lib/logEvent";
import { getSelectedStoryPeople } from "@/lib/storyPeopleSelection";
import type { Story, StoryPage } from "@/types";

export type GenerationStage = "starting" | "drafting" | "polishing";

/** Live snapshot the SSE observer relays while a story is being generated. */
export interface StorySnapshotState {
  stage: GenerationStage;
  pages: StoryPage[];
  updatedAt: string;
}

const SNAPSHOT_TTL_SECONDS = 15 * 60;

function snapshotKey(storyId: string): string {
  return `story:snapshot:${storyId}`;
}

export async function readStorySnapshot(
  storyId: string
): Promise<StorySnapshotState | null> {
  try {
    return (await kv.get<StorySnapshotState>(snapshotKey(storyId))) ?? null;
  } catch {
    return null;
  }
}

async function writeStorySnapshot(
  storyId: string,
  state: StorySnapshotState
): Promise<void> {
  try {
    await kv.set(snapshotKey(storyId), state, { ex: SNAPSHOT_TTL_SECONDS });
  } catch {
    // Snapshots are best-effort live UX; never fail generation over them.
  }
}

async function clearStorySnapshot(storyId: string): Promise<void> {
  try {
    await kv.del(snapshotKey(storyId));
  } catch {
    // ignore
  }
}

export interface RunStoryGenerationResult {
  status: "ready" | "failed" | "skipped";
  story?: Story;
  error?: string;
}

const CLAIM_HEARTBEAT_INTERVAL_MS = 15 * 1000;

/**
 * A generation claim is considered abandoned once its heartbeat is older than
 * this. Kept comfortably above the heartbeat interval so a healthy generator is
 * never mistaken for a dead one, while still recovering a crashed one quickly.
 */
export const GENERATION_CLAIM_STALE_MS = 90 * 1000;

/**
 * Generates a story end-to-end and persists the terminal result. This is the
 * single source of truth for story generation, shared by the live SSE route
 * and the durable Inngest fallback job.
 *
 * Durability/idempotency guarantees:
 * - The credit charge is applied at most once, guarded by `story.creditChargedAt`.
 * - Snapshots are streamed to KV so a reconnecting client can observe progress.
 * - Callers should have already claimed the story via `db.stories.claimGeneration`.
 */
export async function runStoryGeneration(
  storyId: string,
  options: {
    locale?: string;
    /**
     * Claim id held by the caller. When provided, the generator periodically
     * refreshes the claim so the durable fallback's stale window never races a
     * healthy live generation.
     */
    jobId?: string;
    onSnapshot?: (state: StorySnapshotState) => void;
  } = {}
): Promise<RunStoryGenerationResult> {
  const story = await db.stories.getById(storyId);
  if (!story) return { status: "skipped", error: "Story not found" };
  if (story.status === "ready") return { status: "ready", story };

  let lastHeartbeat = 0;
  const heartbeat = async () => {
    if (!options.jobId) return;
    const nowMs = Date.now();
    if (nowMs - lastHeartbeat < CLAIM_HEARTBEAT_INTERVAL_MS) return;
    lastHeartbeat = nowMs;
    try {
      await db.stories.refreshGenerationClaim(
        storyId,
        options.jobId,
        new Date(nowMs).toISOString()
      );
    } catch {
      // Heartbeat is best-effort; never fail generation over it.
    }
  };

  const emit = async (state: StorySnapshotState) => {
    options.onSnapshot?.(state);
    await writeStorySnapshot(storyId, state);
    await heartbeat();
  };

  await emit({
    stage: "starting",
    pages: [],
    updatedAt: new Date().toISOString(),
  });

  const client = await clerkClient();

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new StoryGenerationError(
        "Story generation isn't available right now. Please try again shortly.",
        "ANTHROPIC_API_KEY not configured"
      );
    }

    const user = await client.users.getUser(story.userId);
    const isAdmin = user.privateMetadata.isAdmin === true;

    const profile = await db.profiles.getById(story.profileId);
    if (!profile || profile.userId !== story.userId) {
      throw new StoryGenerationError("Profile not found", "Profile not found");
    }

    const [characters, recentStories] = await Promise.all([
      db.characters.getByProfileId(story.profileId),
      db.stories.getByProfileId(story.profileId),
    ]);
    const safeCharacters = characters.filter((c) => c.userId === story.userId);
    const selectedStoryPeople = await getSelectedStoryPeople({
      userId: story.userId,
      profileId: story.profileId,
      storyPersonIds: story.storyPersonIds ?? [],
    });

    const profileIpPolicy = assessProfileIp({
      ...profile,
      characters: safeCharacters,
      storyPeople: selectedStoryPeople,
    });
    if (profileIpPolicy.printAllowed === false) {
      throw new Error(profileIpErrorResponse(profileIpPolicy).error);
    }

    const recentTitles = recentStories
      .filter((s) => s.userId === story.userId && s.id !== story.id)
      .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
      .slice(0, 5)
      .map((s) => s.title);

    const generated = await streamStory(
      {
        profile,
        characters: safeCharacters,
        storyPeople: selectedStoryPeople,
        theme: story.theme,
        premise: story.premise,
        notes: story.notes,
        locationHint: story.locationHint,
        storyPreset: story.storyPreset,
        recentTitles,
        locale: options.locale,
      },
      (textPages) => {
        void emit({
          stage: "drafting",
          pages: textPages.map(
            (text, index): StoryPage => ({
              pageNumber: index + 1,
              text,
              illustrationPrompt: "",
            })
          ),
          updatedAt: new Date().toISOString(),
        });
      },
      (stage) => {
        void emit({
          stage,
          pages: [],
          updatedAt: new Date().toISOString(),
        });
      }
    );

    const wordCount = generated.pages.reduce(
      (acc, page) => acc + page.text.split(/\s+/).filter(Boolean).length,
      0
    );

    const finalStory: Story = {
      ...story,
      title: generated.title,
      pages: generated.pages,
      wordCount,
      status: "ready",
      generationError: undefined,
    };
    const generatedIpPolicy = assessGeneratedStoryIp(finalStory);
    const storyForStorage: Story =
      generatedIpPolicy.riskLevel === "restricted"
        ? { ...finalStory, ipPolicy: generatedIpPolicy }
        : finalStory;

    // Charge the story credit exactly once. `creditChargedAt` is set in the same
    // update that flips the story to ready, so a retried generation never
    // re-charges even if it re-runs the model.
    const alreadyCharged = Boolean(story.creditChargedAt);
    const shouldCharge = !isAdmin && !alreadyCharged;
    const updated = await db.stories.update(storyId, {
      ...storyForStorage,
      creditChargedAt: alreadyCharged
        ? story.creditChargedAt
        : new Date().toISOString(),
    });

    if (shouldCharge) {
      try {
        const fresh = await client.users.getUser(story.userId);
        const credits =
          (fresh.privateMetadata.credits as number | undefined) ?? 3;
        await client.users.updateUserMetadata(story.userId, {
          privateMetadata: {
            credits: Math.max(0, credits - STORY_CREDIT_COST),
          },
        });
      } catch (err) {
        // The story is already saved; a failed credit debit should not fail the
        // generation. Log so it can be reconciled.
        await logEvent({
          error: err,
          fallbackCode: "story.generation_failed",
          userId: story.userId,
          entityType: "story",
          entityId: storyId,
          source: "story/generation",
          context: { phase: "credit_charge" },
        });
      }
    }

    await kv.del(`suggestions:${story.profileId}`).catch(() => undefined);
    await clearStorySnapshot(storyId);

    return { status: "ready", story: updated ?? storyForStorage };
  } catch (err) {
    const message =
      err instanceof StoryGenerationError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Story generation failed";
    const technicalMessage =
      err instanceof StoryGenerationError
        ? err.technicalMessage
        : err instanceof Error
          ? err.message
          : undefined;

    await db.stories.update(storyId, {
      status: "failed",
      generationError: message,
    });
    await clearStorySnapshot(storyId);
    await logEvent({
      error: err,
      fallbackCode: "story.generation_failed",
      userId: story.userId,
      entityType: "story",
      entityId: storyId,
      source: "story/generation",
      context: {
        theme: story.theme,
        profileId: story.profileId,
        technicalMessage,
      },
    });
    return { status: "failed", error: message };
  }
}
