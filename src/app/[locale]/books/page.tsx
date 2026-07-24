import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import Nav from "@/components/Nav";
import BooksLibrary from "@/components/BooksLibrary";
import { db } from "@/lib/db";

export const metadata = { title: "Books — Storycot" };

export default async function BooksPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const [t, projectsRaw, stories] = await Promise.all([
    getTranslations("books"),
    db.bookProjects.getByUserId(userId),
    db.stories.getByUserId(userId),
  ]);
  const projects = projectsRaw.sort((a, b) =>
    a.createdAt > b.createdAt ? -1 : 1
  );

  return (
    <>
      <Nav />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl px-5 py-10">
        <div className="mb-8">
          <h1 className="font-display text-4xl font-bold text-night-800">
            {t("listTitle")}
          </h1>
          <p className="mt-2 text-night-500">{t("listSub")}</p>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-3xl border border-night-100 bg-white p-10 text-center shadow-sm">
            <p className="font-display text-2xl font-bold text-night-800">
              {t("emptyTitle")}
            </p>
            <p className="mt-3 text-night-500">{t("emptySub")}</p>
            <Link
              href="/stories"
              className="storycot-btn storycot-btn-primary mt-6"
            >
              {t("emptyButton")}
            </Link>
          </div>
        ) : (
          <BooksLibrary projects={projects} stories={stories} />
        )}
      </main>
    </>
  );
}
