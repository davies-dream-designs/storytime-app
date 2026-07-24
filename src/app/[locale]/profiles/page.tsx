import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import Nav from "@/components/Nav";
import { buttonClassName } from "@/components/ui/buttonStyles";
import { db } from "@/lib/db";

export const metadata = { title: "Profiles — Storycot" };

export default async function ProfilesPage() {
  const { userId } = await auth();
  const [t, tCommon, profiles, stories] = await Promise.all([
    getTranslations("profiles"),
    getTranslations("common"),
    db.profiles.getByUserId(userId!),
    db.stories.getByUserId(userId!),
  ]);
  const now = new Date();
  const storyCounts = stories.reduce<Record<string, number>>(
    (counts, story) => {
      counts[story.profileId] = (counts[story.profileId] ?? 0) + 1;
      return counts;
    },
    {}
  );

  return (
    <>
      <Nav />
      <main id="main-content" className="mx-auto max-w-6xl px-5 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-display text-4xl font-bold text-night-800">
              {t("title")}
            </h1>
            <p className="mt-1 text-night-500">{t("subtitle")}</p>
          </div>
          <Link
            href="/profiles/new"
            className={buttonClassName({ size: "compact" })}
          >
            {t("addChild")}
          </Link>
        </div>

        {profiles.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-night-200 p-16 text-center">
            <div className="text-5xl" aria-hidden>
              👶
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
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((profile) => {
              const storyCount = storyCounts[profile.id] ?? 0;
              return (
                <div key={profile.id} className="relative">
                  <Link
                    href={`/profiles/${profile.id}` as string}
                    className="group block rounded-2xl border border-night-100 bg-white p-6 pb-16 shadow-sm transition hover:shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-star-300 to-moon-300 font-display text-2xl font-bold text-night-800">
                        {profile.name[0].toUpperCase()}
                      </div>
                      <span className="rounded-full bg-night-50 px-3 py-1 text-sm font-bold text-night-500">
                        {(() => {
                          if (profile.dateOfBirth) {
                            const dob = new Date(profile.dateOfBirth);
                            const totalMonths =
                              (now.getFullYear() - dob.getFullYear()) * 12 +
                              (now.getMonth() - dob.getMonth());
                            return totalMonths < 12
                              ? tCommon("monthsOld", { months: Math.max(totalMonths, 0) })
                              : tCommon("yearsOld", { years: Math.floor(totalMonths / 12) });
                          }
                          return t("ageLabel", { age: profile.age });
                        })()}
                      </span>
                    </div>
                    <h3 className="mt-4 font-display text-xl font-bold text-night-800 group-hover:text-night-600">
                      {profile.name}
                    </h3>
                    {profile.favouriteCharacters.length > 0 && (
                      <p className="mt-1 text-sm text-night-400 line-clamp-1">
                        {t("lovesLabel", {
                          items: profile.favouriteCharacters.join(", "),
                        })}
                      </p>
                    )}
                    <p className="mt-4 text-sm text-night-400">
                      {storyCount === 1
                        ? t("storyCount", { count: storyCount })
                        : t("storiesCount", { count: storyCount })}
                    </p>
                  </Link>
                  <Link
                    href={`/stories/new?profileId=${profile.id}` as string}
                    className={buttonClassName({
                      size: "compact",
                      className: "absolute bottom-5 right-5 z-10 text-xs",
                    })}
                  >
                    {t("generate")}
                  </Link>
                </div>
              );
            })}
            <Link
              href="/profiles/new"
              className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-night-200 p-6 text-night-400 transition hover:border-night-400 hover:text-night-600"
            >
              <span className="text-3xl" aria-hidden>
                +
              </span>
              <span className="mt-2 font-display font-bold">
                {t("addAnother")}
              </span>
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
