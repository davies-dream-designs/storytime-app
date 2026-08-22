import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import Nav from "@/components/Nav";
import DashboardGreeting from "@/components/DashboardGreeting";

export const metadata = { title: "Dashboard - Storycot" };
import ReferralRedeemer from "@/components/ReferralRedeemer";
import StoryCard from "@/components/StoryCard";
import Icon, { type IconName } from "@/components/ui/Icon";
import { buttonClassName } from "@/components/ui/buttonStyles";
import { db } from "@/lib/db";
import { formatLocalShortDate } from "@/lib/dates";
import { getStoryThemeName } from "@/lib/storyTheme";

export default async function Dashboard() {
  const { userId } = await auth();
  const [t, tHome, profiles, storiesRaw, storyPeople] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("home"),
    db.profiles.getByUserId(userId!),
    db.stories.getByUserId(userId!),
    db.storyPeople.getByUserId(userId!),
  ]);
  const themeNames = tHome.raw("themes") as Record<string, string>;
  const stories = storiesRaw.sort((a, b) =>
    a.createdAt > b.createdAt ? -1 : 1
  );
  const recentStories = stories.slice(0, 3);

  return (
    <>
      <Nav />
      <ReferralRedeemer />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-6xl px-5 py-10"
      >
        <DashboardGreeting
          storiesCount={stories.length}
          profilesCount={profiles.length}
        />

        <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: t("statProfiles"),
              value: profiles.length,
              icon: "profile",
              href: "/profiles",
            },
            {
              label: t("statStories"),
              value: stories.length,
              icon: "book",
              href: "/stories",
            },
            {
              label: t("statFamily"),
              value: storyPeople.length,
              icon: "profile",
              href: "/family",
            },
            {
              label: t("statLastStory"),
              value: recentStories[0]
                ? formatLocalShortDate(recentStories[0].createdAt)
                : "-",
              icon: "sparkle",
              href: recentStories[0]
                ? `/stories/${recentStories[0].id}`
                : "/stories",
            },
          ].map((stat) => (
            <Link
              key={stat.label}
              href={stat.href as string}
              className="flex items-center gap-4 rounded-2xl border border-night-100 bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-night-50 text-2xl">
                <Icon name={stat.icon as IconName} className="h-6 w-6" />
              </div>
              <div>
                <p className="font-display text-2xl font-bold text-night-800">
                  {stat.value}
                </p>
                <p className="text-sm text-night-400">{stat.label}</p>
              </div>
            </Link>
          ))}
        </div>

        <div className="mb-10 grid gap-4 sm:grid-cols-2">
          <Link
            href="/stories/new"
            className="flex items-center gap-4 rounded-2xl bg-night-700 px-6 py-5 text-white transition hover:bg-night-600"
          >
            <Icon name="plus" className="h-7 w-7" />
            <div>
              <p className="font-display text-lg font-bold">
                {t("generateTitle")}
              </p>
              <p className="text-sm text-night-200">{t("generateSub")}</p>
            </div>
          </Link>
          <Link
            href="/profiles/new"
            className="flex items-center gap-4 rounded-2xl border-2 border-dashed border-night-200 px-6 py-5 text-night-600 transition hover:border-night-400 hover:text-night-800"
          >
            <Icon name="profile" className="h-7 w-7" />
            <div>
              <p className="font-display text-lg font-bold">
                {t("addProfileTitle")}
              </p>
              <p className="text-sm text-night-400">{t("addProfileSub")}</p>
            </div>
          </Link>
          <Link
            href="/family"
            className="flex items-center gap-4 rounded-2xl border border-night-100 bg-white px-6 py-5 text-night-600 transition hover:border-night-300 hover:text-night-800 hover:shadow-sm"
          >
            <Icon name="profile" className="h-7 w-7" />
            <div>
              <p className="font-display text-lg font-bold">
                {t("familyTitle")}
              </p>
              <p className="text-sm text-night-400">{t("familySub")}</p>
            </div>
          </Link>
        </div>

        {recentStories.length > 0 && (
          <section>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold text-night-800">
                {t("recentStories")}
              </h2>
              <Link
                href="/stories"
                className="text-sm font-bold text-star-500 hover:text-star-600"
              >
                {t("viewAll")}
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {recentStories.map((story) => (
                <StoryCard
                  key={story.id}
                  story={story}
                  themeName={getStoryThemeName(story.theme, themeNames)}
                  labels={{
                    forProfile: t("storyFor", { name: story.profileName }),
                    read: t("readButton"),
                    words: t("wordCount", { count: story.wordCount }),
                    pages: t("pageCount", { count: story.pages.length }),
                  }}
                  compact
                />
              ))}
            </div>
          </section>
        )}

        {stories.length === 0 && profiles.length === 0 && (
          <div className="rounded-3xl border-2 border-dashed border-night-200 p-16 text-center">
            <Icon name="sparkle" className="mx-auto h-10 w-10 text-star-500" />
            <h2 className="mt-4 font-display text-2xl font-bold text-night-700">
              {t("emptyTitle")}
            </h2>
            <p className="mt-2 text-night-400">{t("emptySub")}</p>
            <Link
              href="/profiles/new"
              className={buttonClassName({ className: "mt-6" })}
            >
              {t("emptyButton")}
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
