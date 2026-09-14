import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import type { Story } from "@/types";
import { sendPublicStoryNotificationEmail } from "@/lib/email";

function getAppUrl(origin: string): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? `${origin}/en`;
}

function storyOwnerName(story: Story): string {
  return story.publicAuthorName ?? story.profileName ?? "there";
}

async function getOwnerEmail(userId: string): Promise<string | null> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return user.primaryEmailAddress?.emailAddress ?? null;
}

export async function notifyPublicStoryOwner(input: {
  story: Story;
  origin: string;
  subject: string;
  headline: string;
  body: string;
  actionPath: string;
  actionLabel: string;
}): Promise<void> {
  // Best-effort: this runs AFTER the moderation/vote state is already committed,
  // so a transient email failure must never turn a successful action into a 500.
  try {
    const toEmail = await getOwnerEmail(input.story.userId);
    if (!toEmail) return;

    const appUrl = getAppUrl(input.origin);
    const actionUrl = `${appUrl.replace(/\/+$/, "")}/${input.actionPath.replace(/^\/+/, "")}`;
    await sendPublicStoryNotificationEmail({
      toEmail,
      toName: storyOwnerName(input.story),
      storyTitle: input.story.title,
      subject: input.subject,
      headline: input.headline,
      body: input.body,
      actionUrl,
      actionLabel: input.actionLabel,
      appUrl,
    });
  } catch (err) {
    console.error("notifyPublicStoryOwner failed; action already persisted.", {
      storyId: input.story.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
