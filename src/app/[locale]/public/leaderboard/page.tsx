import Nav from "@/components/Nav";
import Icon from "@/components/ui/Icon";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import type { StoryPreset } from "@/types";
import Image from "next/image";
import PublicStoryActions from "../PublicStoryActions";

export const metadata = { title: "Monthly Leaderboard - Storycot" };

const leaderboardCategories: Array<{
  key: "all" | StoryPreset;
  label: string;
  description: string;
}> = [
  {
    key: "all",
    label: "All stories",
    description: "Overall monthly ranking",
  },
  {
    key: "tiny-tales",
    label: "Little listeners",
    description: "Shorter stories for the youngest readers",
  },
  {
    key: "moonlit-adventures",
    label: "Bedtime adventures",
    description: "Classic cosy Storycot reads",
  },
  {
    key: "epic-sagas",
    label: "Older readers",
    description: "Longer stories with bigger arcs",
  },
];

function isMissingDatabaseConfigError(error: unknown) {
  return (
    error instanceof Error && error.message.includes("DATABASE_URL is not set")
  );
}

function getSelectedCategory(value: string | string[] | undefined) {
  const category = Array.isArray(value) ? value[0] : value;
  return (
    leaderboardCategories.find((item) => item.key === category) ??
    leaderboardCategories[0]
  );
}

async function getLeaderboard(storyPreset?: StoryPreset) {
  try {
    return await db.publicStoryVotes.leaderboard(50, { storyPreset });
  } catch (error) {
    if (isMissingDatabaseConfigError(error)) {
      console.warn("Public leaderboard unavailable: DATABASE_URL is not set.");
      return [];
    }
    throw error;
  }
}

export default async function PublicLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[] }>;
}) {
  const selectedCategory = getSelectedCategory((await searchParams).category);
  const selectedPreset =
    selectedCategory.key === "all" ? undefined : selectedCategory.key;
  const leaders = await getLeaderboard(selectedPreset);
  const thumbnails = await db.bookProjects.getPublicThumbnailsByStoryIds(
    leaders.map(({ story }) => story.id)
  );
  const voteMonth = db.publicStoryVotes.getVoteMonth();

  return (
    <>
      <Nav />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-4xl px-5 py-10"
      >
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-star-600">
              {voteMonth}
            </p>
            <h1 className="font-display text-4xl font-bold text-night-800">
              Monthly leaderboard
            </h1>
            <p className="mt-2 max-w-2xl text-night-500">
              The most-voted approved public stories this month. Use categories
              to shortlist smaller winner groups while rewards stay manual.
            </p>
          </div>
          <Link href="/public" className="storycot-btn storycot-btn-secondary">
            <Icon name="book" />
            Gallery
          </Link>
        </div>

        <div className="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {leaderboardCategories.map((category) => {
            const selected = category.key === selectedCategory.key;
            const href =
              category.key === "all"
                ? "/public/leaderboard"
                : (`/public/leaderboard?category=${category.key}` as const);

            return (
              <Link
                key={category.key}
                href={href}
                className={`rounded-2xl border p-4 transition ${
                  selected
                    ? "border-star-300 bg-star-50 text-night-800 shadow-sm"
                    : "border-night-100 bg-white text-night-600 hover:border-moon-200"
                }`}
              >
                <span className="text-sm font-bold">{category.label}</span>
                <span className="mt-1 block text-xs leading-5 text-night-400">
                  {category.description}
                </span>
              </Link>
            );
          })}
        </div>

        {leaders.length === 0 ? (
          <section className="rounded-2xl border border-night-100 bg-white p-8 text-center shadow-sm">
            <Icon name="sparkle" className="mx-auto h-8 w-8 text-night-300" />
            <h2 className="mt-3 font-display text-2xl font-bold text-night-800">
              No votes yet this month
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-night-500">
              Approved public stories will appear here after readers vote for
              them
              {selectedCategory.key === "all"
                ? "."
                : ` in ${selectedCategory.label.toLowerCase()}.`}
            </p>
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-night-100 bg-white shadow-sm">
            {leaders.map(({ story, votes }, index) => {
              const thumbnailUrl = thumbnails[story.id];

              return (
                <div
                  key={story.id}
                  className="grid grid-cols-[40px_56px_1fr] items-center gap-3 border-b border-night-100 px-3 py-3 last:border-b-0 sm:grid-cols-[48px_64px_1fr_auto] sm:px-4"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-moon-100 font-display text-lg font-bold text-night-800 sm:h-10 sm:w-10">
                    {index + 1}
                  </div>
                  {thumbnailUrl ? (
                    <div className="relative h-14 w-14 overflow-hidden rounded-lg border border-night-100 shadow-sm sm:h-16 sm:w-16">
                      <Image
                        src={thumbnailUrl}
                        alt=""
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-night-100 bg-star-50 text-night-300 shadow-sm sm:h-16 sm:w-16">
                      <Icon name="book" className="h-6 w-6" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-bold leading-tight text-night-800 sm:text-lg">
                      {story.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-night-500 sm:text-sm">
                      by {story.publicAuthorName ?? "Storycot creator"} ·{" "}
                      {story.theme}
                    </p>
                    {!thumbnailUrl ? (
                      <p className="mt-1 line-clamp-1 text-xs leading-5 text-night-500">
                        {story.pages[0]?.text ?? ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="col-span-3 flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
                    <PublicStoryActions
                      storyId={story.id}
                      storyTitle={story.title}
                      shareToken={story.shareToken}
                      initialVotes={votes}
                      variant="compact"
                    />
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
              );
            })}
          </section>
        )}
      </main>
    </>
  );
}
