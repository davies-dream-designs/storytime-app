import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import Nav from "@/components/Nav";
import { db } from "@/lib/db";
import BookStatusPanel from "./BookStatusPanel";

export default async function BookProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;
  const t = await getTranslations("books");
  const project = await db.bookProjects.getById(id);
  if (!project || project.userId !== userId) notFound();

  const story = await db.stories.getById(project.sourceStoryId);
  if (!story || story.userId !== userId) notFound();

  const hasPrintPdf = Boolean(project.assets.printPdfUrl);
  const hasEpub = Boolean(project.assets.epubUrl);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-5 py-10">
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-2 text-sm text-night-400">
            <Link
              href={`/stories/${story.id}` as string}
              className="hover:text-night-600"
            >
              {t("backToStory")}
            </Link>
          </div>
          <h1 className="font-display text-4xl font-bold text-night-800">
            {project.status === "ready"
              ? t("illustratedPdfReadyTitle")
              : t("illustratedPdfTitle")}
          </h1>
          <p className="mt-2 text-night-500">
            {project.status === "ready"
              ? t("illustratedPdfReadyPageSub", { title: story.title })
              : t("illustratedPdfPageSub", { title: story.title })}
          </p>
        </div>

        <BookStatusPanel initialProject={project} />

        {hasPrintPdf || hasEpub ? (
          <section className="mt-8 rounded-3xl border border-night-100 bg-white p-8 shadow-sm">
            <h2 className="font-display text-2xl font-bold text-night-800">
              {t("illustratedPdfDownloadTitle")}
            </h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {hasPrintPdf ? (
                <a
                  href={`/api/books/${project.id}/download?asset=printPdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-night-700 px-5 py-3 text-sm font-bold text-moon-200 transition hover:bg-night-600"
                >
                  {t("illustratedPdfButton")}
                </a>
              ) : null}
              {hasEpub ? (
                <a
                  href={`/api/books/${project.id}/download?asset=epub`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-night-200 px-5 py-3 text-sm font-bold text-night-700 transition hover:bg-night-50"
                >
                  {t("epubButton")}
                </a>
              ) : null}
            </div>
            {hasEpub ? (
              <p className="mt-3 text-sm leading-6 text-night-500">
                {t("epubHelp")}
              </p>
            ) : null}
          </section>
        ) : null}

        {hasPrintPdf ? (
          <section className="mt-8 rounded-3xl border border-night-100 bg-white p-8 shadow-sm">
            <h2 className="font-display text-2xl font-bold text-night-800">
              {t("hardcoverTitle")}
            </h2>
            <p className="mt-2 text-night-600">{t("hardcoverSub")}</p>
            <button
              type="button"
              disabled
              className="mt-4 rounded-full border border-night-200 px-5 py-3 text-sm font-bold text-night-400"
            >
              {t("hardcoverButton")}
            </button>
          </section>
        ) : null}
      </main>
    </>
  );
}
