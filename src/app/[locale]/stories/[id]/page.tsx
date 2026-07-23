import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import Nav from "@/components/Nav";
import DownloadLink from "@/components/DownloadLink";
import FileDownloadButton from "@/components/FileDownloadButton";
import DeleteStoryButton from "@/components/DeleteStoryButton";
import { getDateLocale } from "@/i18n/locales";
import { db } from "@/lib/db";
import { inferBookAgeBand } from "@/lib/print-books/ageBand";
import {
  getStorycotIllustrationCountForAgeBand,
  getStorycotPageCountForAgeBand,
} from "@/lib/print-books/printProducts";
import { estimateIllustratedBookCredits } from "@/lib/pricing";
import { getUserCredits } from "@/lib/credits";
import StoryReader from "./StoryReader";
import ShareButton from "./ShareButton";
import CreatePrintBookButton from "./CreatePrintBookButton";

export default async function StoryPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { userId } = await auth();
  const { id, locale } = await params;
  const t = await getTranslations("stories");
  const story = await db.stories.getById(id);
  if (!story || story.userId !== userId) notFound();

  const [profile, bookProjects, { credits: userCredits, isAdmin }] =
    await Promise.all([
      db.profiles.getById(story.profileId),
      db.bookProjects.getByStoryId(id),
      userId
        ? getUserCredits(userId)
        : Promise.resolve({ credits: 0, isAdmin: false }),
    ]);
  const existingBook = bookProjects.find((p) => p.status !== "failed") ?? null;
  const ageBand = profile
    ? inferBookAgeBand({ profile, storyPreset: story.storyPreset })
    : "3-5";
  const estimatedPageCount = getStorycotPageCountForAgeBand(ageBand);
  const estimatedIllustrationCount =
    getStorycotIllustrationCountForAgeBand(ageBand);
  const illustrationEstimate = estimateIllustratedBookCredits({
    ageBand,
    pageCount: estimatedPageCount,
    illustrationCount: estimatedIllustrationCount,
  });
  const dateLocale = getDateLocale(locale);
  const isFailed = story.status === "failed";
  const isReady = !story.status || story.status === "ready";

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-5 py-10">
        <div className="mb-6">
          {/* Title row + action buttons */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Link
                  href="/stories"
                  className="text-sm text-night-400 hover:text-night-600"
                >
                  {t("backToLibrary")}
                </Link>
                <span className="text-night-300">·</span>
                {profile && (
                  <Link
                    href={`/profiles/${profile.id}` as string}
                    className="text-sm text-star-500 hover:text-star-600"
                  >
                    {story.profileName}
                  </Link>
                )}
              </div>
              <h1 className="font-display text-3xl font-bold text-night-800 sm:text-4xl">
                {isReady ? story.title : t("streamingTitle")}
              </h1>
              <p className="mt-1 text-night-400">
                {story.theme} ·{" "}
                {isReady
                  ? `${t("wordsCount", { count: story.wordCount })} · ${t(
                      "pagesCount",
                      { count: story.pages.length }
                    )} · `
                  : isFailed
                    ? `${t("streamingFailed")} · `
                    : `${t("streamingInProgress")} · `}
                {new Date(story.createdAt).toLocaleDateString(dateLocale, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>

            {/* Primary actions — compact, no inline estimate boxes */}
            <div className="flex shrink-0 flex-wrap items-start gap-2">
              <Link
                href={`/stories/new?profileId=${story.profileId}` as string}
                className="storycot-btn storycot-btn-primary"
              >
                {t("newStoryButton")}
              </Link>
              {isReady && (
                <>
                  {existingBook ? (
                    <Link
                      href={`/books/${existingBook.id}` as string}
                      className="storycot-btn storycot-btn-secondary"
                    >
                      {t("viewBookButton")}
                    </Link>
                  ) : (
                    <CreatePrintBookButton
                      storyId={id}
                      credits={illustrationEstimate.credits}
                      pageCount={estimatedPageCount}
                      illustrationCount={estimatedIllustrationCount}
                      userCredits={userCredits}
                      isAdmin={isAdmin}
                      storyPreset={story.storyPreset}
                      compact
                    />
                  )}
                  <ShareButton storyId={id} />
                  <DeleteStoryButton storyId={id} redirectTo="/stories" />
                </>
              )}
            </div>
          </div>

          {/* Estimate info — shown below when creating a new book */}
          {isReady && !existingBook && (
            <div className="mt-3 max-w-md rounded-2xl border border-star-200 bg-star-50 px-4 py-3 text-sm text-night-600">
              <p className="font-bold text-night-800">Illustration estimate</p>
              <p className="mt-1">
                {illustrationEstimate.credits} credits ·{" "}
                {estimatedPageCount} pages · {estimatedIllustrationCount}{" "}
                illustrations
              </p>
            </div>
          )}

          {/* Text exports — secondary row, always below the title row */}
          {isReady && (
            <div className="mt-3 flex flex-wrap gap-2">
              <DownloadLink
                href={`/stories/${id}/print`}
                target="_blank"
                rel="noopener noreferrer"
                className="storycot-btn storycot-btn-secondary text-sm"
                pendingLabel={t("downloadStarting")}
              >
                {t("printButton")}
              </DownloadLink>
              <FileDownloadButton
                href={`/api/stories/${id}/epub`}
                shareTitle={story.title}
                label={t("textEpubButton")}
                pendingLabel={t("downloadStarting")}
                className="storycot-btn storycot-btn-secondary text-sm"
                shareWhenAvailable
              />
            </div>
          )}
        </div>
        <StoryReader story={story} />
      </main>
    </>
  );
}
