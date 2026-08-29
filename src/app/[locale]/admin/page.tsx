import { notFound } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Suspense } from "react";
import Nav from "@/components/Nav";
import { db } from "@/lib/db";
import MigrationActions from "./MigrationActions";
import TestEmailActions from "./TestEmailActions";
import LuluWebhookActions from "./LuluWebhookActions";
import PrintOrdersSection from "./PrintOrdersSection";
import IssuesSection from "./IssuesSection";
import CustomerLookup from "./CustomerLookup";
import PublicStoryReviewSection from "./PublicStoryReviewSection";
import PublicStoryReportsSection from "./PublicStoryReportsSection";
import PublicStoryModerationEventsSection from "./PublicStoryModerationEventsSection";
import PublicStoryRewardsSection from "./PublicStoryRewardsSection";
import type { PublicStoryPrintReadiness } from "@/lib/publicStoryPrintReadiness";
import AdminTabs, { getActiveTab } from "./AdminTabs";

export const metadata = { title: "Admin - Storycot" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) notFound();

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user.privateMetadata.isAdmin !== true) notFound();

  let projects: Awaited<ReturnType<typeof db.bookProjects.getById>>[] = [];
  let printOrders: Awaited<ReturnType<typeof db.bookProjects.getPrintOrders>> =
    [];
  let publicReviewStories: Awaited<
    ReturnType<typeof db.stories.getPublicReviewQueue>
  > = [];
  let publicStoryReports: Awaited<
    ReturnType<typeof db.publicStoryReports.listOpen>
  > = [];
  let publicModerationEvents: Awaited<
    ReturnType<typeof db.publicStoryModerationEvents.listRecent>
  > = [];
  let publicLeaderboard: Awaited<
    ReturnType<typeof db.publicStoryVotes.leaderboard>
  > = [];
  let publicPrintReadiness: Record<string, PublicStoryPrintReadiness> = {};
  let dbReady = true;
  try {
    const failedIds = await db.bookProjects.getFailedIndex();
    projects = (
      await Promise.all(failedIds.map((id) => db.bookProjects.getById(id)))
    ).filter(Boolean);
    [
      printOrders,
      publicReviewStories,
      publicStoryReports,
      publicModerationEvents,
      publicLeaderboard,
    ] = await Promise.all([
      db.bookProjects.getPrintOrders(),
      db.stories.getPublicReviewQueue(),
      db.publicStoryReports.listOpen(),
      db.publicStoryModerationEvents.listRecent(50),
      db.publicStoryVotes.leaderboard(10),
    ]);
    publicPrintReadiness =
      await db.bookProjects.getPublicPrintReadinessByStoryIds(
        publicLeaderboard.map((entry) => entry.story.id)
      );
  } catch (err) {
    dbReady = false;
    console.error("[admin] failed to load failed books / print orders", err);
  }

  const { tab: rawTab } = await searchParams;
  const tab = getActiveTab(rawTab);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5 sm:py-10">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-night-800 sm:text-3xl">
            Admin
          </h1>
          <p className="mt-1 text-sm text-night-400">
            {dbReady
              ? `${projects.length} failed project${projects.length !== 1 ? "s" : ""}`
              : "DB not ready — run migration in Tools first"}
          </p>
        </div>

        <Suspense>
          <AdminTabs active={tab} />
        </Suspense>

        {tab === "overview" && (
          <div className="space-y-8">
            <IssuesSection />
            <div>
              <h2 className="font-display text-xl font-bold text-night-800 mb-1">
                Failed book builds
              </h2>
              <p className="mb-3 text-sm text-night-400">
                Current failed state per book. Live errors are in Issues above.
              </p>
              {projects.length === 0 ? (
                <div className="rounded-2xl border border-night-100 bg-white p-8 text-center text-night-400">
                  No failed books. Nice.
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {projects.map((p) => (
                    <div
                      key={p!.id}
                      className="rounded-2xl border border-night-100 bg-white p-6 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-night-400 truncate max-w-[200px] sm:max-w-none">
                            {p!.id}
                          </p>
                          <p className="text-xs text-night-500 mt-0.5 truncate max-w-[200px] sm:max-w-none">
                            user: <span className="font-mono">{p!.userId}</span>
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="inline-block rounded-full bg-blush-100 px-3 py-1 text-xs font-bold text-blush-700">
                            {p!.errorCode ?? "unknown"}
                          </span>
                          <p className="text-xs text-night-400 mt-1">
                            {new Date(p!.updatedAt).toLocaleString("en-AU", {
                              timeZone: "Australia/Adelaide",
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </p>
                          <p className="text-xs text-night-400">
                            retries: {p!.retryCount}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm font-medium text-night-700 mb-2">
                        User saw: &ldquo;{p!.errorMessage ?? "-"}&rdquo;
                      </p>
                      {p!.rawError ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-night-400 hover:text-night-600">
                            Raw error
                          </summary>
                          <pre className="mt-2 overflow-x-auto rounded-xl bg-night-50 p-3 text-xs text-night-700 whitespace-pre-wrap break-all">
                            {p!.rawError}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "content" && (
          <div className="space-y-8">
            <PublicStoryReviewSection stories={publicReviewStories} />
            <PublicStoryReportsSection reports={publicStoryReports} />
            <PublicStoryModerationEventsSection events={publicModerationEvents} />
          </div>
        )}

        {tab === "rewards" && (
          <PublicStoryRewardsSection
            leaders={publicLeaderboard}
            printReadiness={publicPrintReadiness}
            voteMonth={db.publicStoryVotes.getVoteMonth()}
          />
        )}

        {tab === "print" && (
          <div className="space-y-8">
            <PrintOrdersSection orders={printOrders} />
            <LuluWebhookActions />
          </div>
        )}

        {tab === "customers" && <CustomerLookup />}

        {tab === "tools" && (
          <div className="space-y-8">
            <TestEmailActions />
            <MigrationActions />
          </div>
        )}
      </main>
    </>
  );
}
