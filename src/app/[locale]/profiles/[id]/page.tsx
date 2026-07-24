import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import Nav from "@/components/Nav";
import { buttonClassName } from "@/components/ui/buttonStyles";
import { db } from "@/lib/db";
import {
  buildChildAppearanceDoNotChange,
  buildChildAppearanceSummary,
  getAppearanceOptionLabel,
} from "@/types";
import DeleteProfileButton from "./DeleteProfileButton";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  const [t, tCommon] = await Promise.all([
    getTranslations("profiles"),
    getTranslations("common"),
  ]);
  const { id } = await params;
  const profile = await db.profiles.getById(id);
  if (!profile || profile.userId !== userId) notFound();

  const [storiesRaw, characters] = await Promise.all([
    db.stories.getByProfileId(id),
    db.characters.getByProfileId(id),
  ]);
  const stories = storiesRaw
    .filter((s) => s.userId === userId)
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
  const myCharacters = characters.filter((c) => c.userId === userId);

  let ageString: string;
  if (profile.dateOfBirth) {
    const now = new Date();
    const dob = new Date(profile.dateOfBirth);
    const totalMonths =
      (now.getFullYear() - dob.getFullYear()) * 12 +
      (now.getMonth() - dob.getMonth());
    ageString =
      totalMonths < 12
        ? tCommon("monthsOld", { months: Math.max(totalMonths, 0) })
        : tCommon("yearsOld", { years: Math.floor(totalMonths / 12) });
  } else {
    ageString = tCommon("yearsOld", { years: profile.age ?? 0 });
  }

  const details = [
    { label: t("detailChars"), values: profile.favouriteCharacters },
    { label: t("detailActivities"), values: profile.favouriteActivities },
    { label: t("detailAnimals"), values: profile.favouriteAnimals },
    { label: t("detailPlaces"), values: profile.favouritePlaces },
    { label: t("detailThemes"), values: profile.lessons },
  ];
  const appearanceSummary = buildChildAppearanceSummary(profile.appearance);
  const appearanceLocks = buildChildAppearanceDoNotChange(profile.appearance);
  const appearanceDetails = [
    ...(profile.appearance?.hairStyles ?? []),
    ...(profile.appearance?.featureEmphasis ?? []),
    ...(profile.appearance?.distinguishingFeatures ?? []),
    ...(profile.appearance?.expressionVibes ?? []),
  ];

  return (
    <>
      <Nav />
      <main id="main-content" className="mx-auto max-w-5xl px-5 py-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-star-300 to-moon-300 font-display text-3xl font-bold text-night-800">
              {profile.name[0].toUpperCase()}
            </div>
            <div>
              <h1 className="font-display text-4xl font-bold text-night-800">
                {profile.name}
              </h1>
              <p className="text-night-500">
                {ageString} ·{" "}
                {stories.length === 1
                  ? t("storyCount", { count: stories.length })
                  : t("storiesCount", { count: stories.length })}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link
              href={`/stories/new?profileId=${id}` as string}
              className={buttonClassName()}
            >
              {t("generateStory")}
            </Link>
            <DeleteProfileButton profileId={id} />
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-1 space-y-5">
            <div className="rounded-2xl border border-night-100 bg-white p-5">
              <h2 className="mb-4 font-display text-lg font-bold text-night-700">
                {t("detailsTitle")}
              </h2>
              <div className="space-y-4">
                {appearanceSummary ? (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-night-400">
                      {t("detailAppearance")}
                    </p>
                    <p className="mt-1.5 text-sm leading-6 text-night-600">
                      {appearanceSummary}
                    </p>
                    {appearanceLocks.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {appearanceLocks.map((value) => (
                          <span
                            key={value}
                            className="rounded-full bg-star-50 px-3 py-1 text-xs font-semibold text-star-700"
                          >
                            {value}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {appearanceDetails.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Array.from(new Set(appearanceDetails))
                          .slice(0, 8)
                          .map((value) => (
                            <span
                              key={value}
                              className="rounded-full bg-night-50 px-3 py-1 text-xs text-night-500"
                            >
                              {getAppearanceOptionLabel(value)}
                            </span>
                          ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {details.map(({ label, values }) =>
                  values.length > 0 ? (
                    <div key={label}>
                      <p className="text-xs font-bold uppercase tracking-wide text-night-400">
                        {label}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {values.map((v) => (
                          <span
                            key={v}
                            className="rounded-full bg-night-50 px-3 py-1 text-sm text-night-600"
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null
                )}
              </div>
              <Link
                href={`/profiles/${id}/edit` as string}
                className="mt-5 block w-full rounded-xl border border-night-200 py-2 text-center text-sm font-bold text-night-600 transition hover:bg-night-50"
              >
                {t("editProfile")}
              </Link>
            </div>

            {myCharacters.length > 0 && (
              <div className="rounded-2xl border border-night-100 bg-white p-5">
                <h2 className="mb-4 font-display text-lg font-bold text-night-700">
                  {t("characterMemory")}
                </h2>
                <div className="space-y-3">
                  {myCharacters.map((c) => (
                    <div key={c.id} className="rounded-xl bg-star-50 p-3">
                      <p className="font-bold text-night-700">{c.name}</p>
                      {c.description && (
                        <p className="mt-0.5 text-xs text-night-500">
                          {c.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <Link
                  href={`/profiles/${id}/characters` as string}
                  className="mt-4 block text-center text-sm font-bold text-star-500 hover:text-star-600"
                >
                  {t("manageCharacters")}
                </Link>
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold text-night-800">
                {t("storiesTitle")}
              </h2>
              <Link
                href={`/stories/new?profileId=${id}` as string}
                className="text-sm font-bold text-star-500 hover:text-star-600"
              >
                {t("newStoryButton")}
              </Link>
            </div>
            {stories.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-night-200 p-10 text-center">
                <div className="text-3xl" aria-hidden>
                  📖
                </div>
                <p className="mt-3 font-display font-bold text-night-600">
                  {t("profileEmptyTitle")}
                </p>
                <p className="text-sm text-night-400">
                  {t("profileEmptySub", { name: profile.name })}
                </p>
                <Link
                  href={`/stories/new?profileId=${id}` as string}
                  className={buttonClassName({
                    size: "compact",
                    className: "mt-4",
                  })}
                >
                  {t("profileEmptyButton")}
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {stories.map((story) => (
                  <Link
                    key={story.id}
                    href={`/stories/${story.id}` as string}
                    className="flex items-center justify-between rounded-2xl border border-night-100 bg-white p-5 transition hover:shadow-md"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-2xl flex-shrink-0" aria-hidden>
                        📖
                      </span>
                      <div className="min-w-0">
                        <p className="font-display font-bold text-night-800 truncate">
                          {story.title}
                        </p>
                        <p className="text-sm text-night-400">
                          {story.theme} ·{" "}
                          {new Date(story.createdAt).toLocaleDateString(
                            undefined,
                            { day: "numeric", month: "short", year: "numeric" }
                          )}
                        </p>
                      </div>
                    </div>
                    <span className="ml-4 flex-shrink-0 text-sm text-night-300">
                      {story.wordCount}w →
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
