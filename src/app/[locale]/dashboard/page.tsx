import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import Nav from "@/components/Nav";
import DashboardGreeting from "@/components/DashboardGreeting";
import ReferralRedeemer from "@/components/ReferralRedeemer";
import { buttonClassName } from "@/components/ui/buttonStyles";
import { db } from "@/lib/db";

export default async function Dashboard() {
  const { userId } = await auth();
  const t = await getTranslations("dashboard");
  const profiles = await db.profiles.getByUserId(userId!);
  const stories = (await db.stories.getByUserId(userId!)).sort((a, b) =>
    a.createdAt > b.createdAt ? -1 : 1
  );
  const recentStories = stories.slice(0, 3);

  return (
    <>
      <Nav />
      <ReferralRedeemer />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <DashboardGreeting
          storiesCount={stories.length}
          profilesCount={profiles.length}
        />

        <div className="mb-10 grid gap-4 sm:grid-cols-3">
          {[
            {
              label: t("statProfiles"),
              value: profiles.length,
              icon: "👶",
              href: "/profiles",
            },
            {
              label: t("statStories"),
              value: stories.length,
              icon: "📖",
              href: "/stories",
            },
            {
              label: t("statLastStory"),
              value: recentStories[0]
                ? new Date(recentStories[0].createdAt).toLocaleDateString(
                    undefined,
                    { day: "numeric", month: "short" }
                  )
                : "—",
              icon: "✨",
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
                {stat.icon}
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
            <span className="text-3xl" aria-hidden>
              ✨
            </span>
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
            <span className="text-3xl" aria-hidden>
              👶
            </span>
            <div>
              <p className="font-display text-lg font-bold">
                {t("addProfileTitle")}
              </p>
              <p className="text-sm text-night-400">{t("addProfileSub")}</p>
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
                <Link
                  key={story.id}
                  href={`/stories/${story.id}`}
                  className="group rounded-2xl border border-night-100 bg-white p-5 shadow-sm transition hover:shadow-md"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-xl" aria-hidden>
                      📖
                    </span>
                    <span className="rounded-full bg-star-100 px-3 py-0.5 text-xs font-bold text-star-600">
                      {story.theme}
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-bold text-night-800 group-hover:text-night-600 line-clamp-2">
                    {story.title}
                  </h3>
                  <p className="mt-1 text-sm text-night-400">
                    {t("storyFor", { name: story.profileName })} ·{" "}
                    {new Date(story.createdAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                  <p className="mt-1 text-xs text-night-300">
                    {t("wordCount", { count: story.wordCount })} ·{" "}
                    {t("pageCount", { count: story.pages.length })}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {stories.length === 0 && profiles.length === 0 && (
          <div className="rounded-3xl border-2 border-dashed border-night-200 p-16 text-center">
            <div className="text-5xl" aria-hidden>
              ✨
            </div>
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
