import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  sendPrintOrderConfirmedEmail,
  sendPublicStoryNotificationEmail,
  sendShippedEmail,
} from "@/lib/email";

export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user.privateMetadata.isAdmin !== true)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const toEmail = user.emailAddresses[0]?.emailAddress;
  if (!toEmail)
    return NextResponse.json({ error: "No email on account" }, { status: 400 });

  const toName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || "there";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://storycot.com.au";
  const fakeTrackUrl = `${appUrl}/stories/example-story-id`;
  const fakePublicStoryUrl = `${appUrl}/s/example-public-token`;

  const results: Record<string, string> = {};

  try {
    await sendPrintOrderConfirmedEmail({
      toEmail,
      toName,
      storyTitle: "The Dragon Who Was Afraid of the Dark",
      productLabel: "Hardcover",
      amountAud: 39.95,
      trackUrl: fakeTrackUrl,
      appUrl,
    });
    results.orderConfirmation = "sent";
  } catch (err) {
    results.orderConfirmation = `failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  try {
    await sendShippedEmail({
      toEmail,
      toName,
      storyTitle: "The Dragon Who Was Afraid of the Dark",
      productLabel: "Hardcover",
      trackingUrl:
        "https://auspost.com.au/mypost/track/#/results?search=EJ123456789AU",
      carrier: "Australia Post",
      trackUrl: fakeTrackUrl,
      appUrl,
    });
    results.shippedNotification = "sent";
  } catch (err) {
    results.shippedNotification = `failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  const publicStoryEmails = [
    {
      key: "publicStoryApproved",
      subject: "Your Storycot story is now public - The Moon Garden Sleepover",
      headline: "Your story is public",
      body: "your story has been approved and can now appear in the public gallery.",
      actionUrl: fakePublicStoryUrl,
      actionLabel: "View public story",
    },
    {
      key: "publicStoryRejected",
      subject: "Storycot public review update - The Moon Garden Sleepover",
      headline: "Your story needs changes",
      body: "your story was not approved for the public gallery yet. Review note: please remove the school name before resubmitting.",
      actionUrl: fakeTrackUrl,
      actionLabel: "Review story",
    },
    {
      key: "publicStoryHiddenForReports",
      subject:
        "Your Storycot story is back in review - The Moon Garden Sleepover",
      headline: "Your story is back in review",
      body: "your public story has been hidden after multiple reader reports. Storycot will review it before it can be listed again.",
      actionUrl: fakeTrackUrl,
      actionLabel: "View story",
    },
    {
      key: "publicStoryDelisted",
      subject:
        "Your Storycot story was removed from the gallery - The Moon Garden Sleepover",
      headline: "Your story was removed from the gallery",
      body: "your public story has been removed from the gallery. Review note: please remove the school name before resubmitting.",
      actionUrl: fakeTrackUrl,
      actionLabel: "Review story",
    },
    {
      key: "publicStoryFirstVote",
      subject: "1 vote for your Storycot story",
      headline: "Your story has its first vote",
      body: "your public story just received its first monthly vote.",
      actionUrl: fakePublicStoryUrl,
      actionLabel: "View public story",
    },
    {
      key: "publicStoryVoteMilestone",
      subject: "10 votes for your Storycot story",
      headline: "10 votes this month",
      body: "your public story has reached 10 votes this month.",
      actionUrl: fakePublicStoryUrl,
      actionLabel: "View public story",
    },
  ];

  for (const email of publicStoryEmails) {
    try {
      await sendPublicStoryNotificationEmail({
        toEmail,
        toName,
        storyTitle: "The Moon Garden Sleepover",
        subject: email.subject,
        headline: email.headline,
        body: email.body,
        actionUrl: email.actionUrl,
        actionLabel: email.actionLabel,
        appUrl,
      });
      results[email.key] = "sent";
    } catch (err) {
      results[email.key] =
        `failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return NextResponse.json({ sentTo: toEmail, results });
}
