import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import Nav from "@/components/Nav";
import StoryLibrary from "@/components/StoryLibrary";
import { db } from "@/lib/db";

export default async function StoriesPage() {
  const { userId } = await auth();
  const [t, storiesRaw, profiles] = await Promise.all([
    getTranslations("stories"),
    db.stories.getByUserId(userId!),
    db.profiles.getByUserId(userId!),
  ]);
  const stories = storiesRaw.sort((a, b) =>
    a.createdAt > b.createdAt ? -1 : 1
  );

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-display text-4xl font-bold text-night-800">
              {t("libraryTitle")}
            </h1>
            <p className="mt-1 text-night-500">
              {stories.length === 1
                ? t("libraryCountSingle")
                : t("libraryCount", { count: stories.length })}
            </p>
          </div>
          <Link
            href="/stories/new"
            className="storycot-btn storycot-btn-primary"
          >
            {t("generateButton")}
          </Link>
        </div>
        <StoryLibrary stories={stories} profiles={profiles} />
      </main>
    </>
  );
}
