import Nav from "@/components/Nav";
import Icon from "@/components/ui/Icon";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { getDateLocale } from "@/i18n/locales";
import Image from "next/image";
import PublicStoryActions from "./PublicStoryActions";

export const metadata = { title: "Public Gallery - Storycot" };

function isMissingDatabaseConfigError(error: unknown) {
  return (
    error instanceof Error && error.message.includes("DATABASE_URL is not set")
  );
}

async function getPublicStories() {
  try {
    return await db.stories.getPublicGallery(60);
  } catch (error) {
    if (isMissingDatabaseConfigError(error)) {
      console.warn("Public gallery unavailable: DATABASE_URL is not set.");
      return [];
    }
    throw error;
  }
}

export default async function PublicGalleryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const stories = await getPublicStories();
  const voteCounts = await db.publicStoryVotes.countByStoryIds(
    stories.map((story) => story.id)
  );
  const printReadiness =
    await db.bookProjects.getPublicPrintReadinessByStoryIds(
      stories.map((story) => story.id)
    );
  const thumbnails = await db.bookProjects.getPublicThumbnailsByStoryIds(
    stories.map((story) => story.id)
  );
  const storiesByVotes = [...stories].sort((a, b) => {
    const voteDiff = (voteCounts[b.id] ?? 0) - (voteCounts[a.id] ?? 0);
    if (voteDiff !== 0) return voteDiff;
    return (b.publicReviewedAt ?? b.createdAt).localeCompare(
      a.publicReviewedAt ?? a.createdAt
    );
  });
  const dateLocale = getDateLocale(locale);

  return (
    <>
      <Nav />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-6xl px-5 py-10"
      >
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-star-600">
              Community
            </p>
            <h1 className="font-display text-4xl font-bold text-night-800">
              Public gallery
            </h1>
            <p className="mt-2 max-w-2xl text-night-500">
              Approved Storycot stories from the community. Voting,
              leaderboards, and public book purchases build on this review
              process.
            </p>
          </div>
          <Link
            href="/public/leaderboard"
            className="storycot-btn storycot-btn-secondary"
          >
            <Icon name="sparkle" />
            Leaderboard
          </Link>
        </div>

        {stories.length === 0 ? (
          <section className="rounded-2xl border border-night-100 bg-white p-8 text-center shadow-sm">
            <Icon name="book" className="mx-auto h-8 w-8 text-night-300" />
            <h2 className="mt-3 font-display text-2xl font-bold text-night-800">
              No public stories yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-night-500">
              Stories will appear here after their creators submit them and an
              admin approves them for public discovery.
            </p>
          </section>
        ) : (
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {storiesByVotes.map((story, index) => (
              <article
                key={story.id}
                className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-night-100 bg-white shadow-sm"
              >
                {thumbnails[story.id] ? (
                  <div className="relative aspect-square w-full overflow-hidden">
                    <Image
                      src={thumbnails[story.id]}
                      alt=""
                      fill
                      sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
                      className="object-cover"
                    />
                  </div>
                ) : null}
                <div className="flex flex-1 flex-col p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] font-bold uppercase tracking-wide text-star-600">
                      {story.theme}
                    </p>
                    <span className="shrink-0 rounded-full bg-moon-100 px-2 py-0.5 text-[11px] font-bold text-night-700">
                      #{index + 1}
                    </span>
                  </div>
                  <h2 className="mt-1 line-clamp-2 font-display text-base font-bold leading-tight text-night-800 sm:text-lg">
                    {story.title}
                  </h2>
                  <p className="mt-1 truncate text-xs text-night-500">
                    by {story.publicAuthorName ?? "Storycot creator"}
                  </p>
                  {!thumbnails[story.id] ? (
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-night-600">
                      {story.pages[0]?.text.slice(0, 120) ?? ""}
                      {story.pages[0]?.text && story.pages[0].text.length > 120
                        ? "..."
                        : ""}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2 border-t border-night-100 p-3 pt-2">
                  <PublicStoryActions
                    storyId={story.id}
                    storyTitle={story.title}
                    shareToken={story.shareToken}
                    printReadiness={printReadiness[story.id]}
                    initialVotes={voteCounts[story.id] ?? 0}
                    variant="compact"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] text-night-400">
                      {new Date(
                        story.publicReviewedAt ?? story.createdAt
                      ).toLocaleDateString(dateLocale, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    {story.shareToken ? (
                      <Link
                        href={`/s/${story.shareToken}` as string}
                        className="storycot-btn storycot-btn-secondary storycot-btn-compact px-3"
                      >
                        Read
                      </Link>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    </>
  );
}
