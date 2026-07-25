import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { sendPrintOrderConfirmedEmail, sendShippedEmail } from "@/lib/email";

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

  const toName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "there";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://storycot.com";
  const fakeTrackUrl = `${appUrl}/stories/example-story-id`;

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
      trackingUrl: "https://auspost.com.au/mypost/track/#/results?search=EJ123456789AU",
      carrier: "Australia Post",
      trackUrl: fakeTrackUrl,
      appUrl,
    });
    results.shippedNotification = "sent";
  } catch (err) {
    results.shippedNotification = `failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  return NextResponse.json({ sentTo: toEmail, results });
}
