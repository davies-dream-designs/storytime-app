import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import Nav from "@/components/Nav";
import DownloadLink from "@/components/DownloadLink";
import FileDownloadButton from "@/components/FileDownloadButton";
import DeleteStoryButton from "@/components/DeleteStoryButton";
import PrintProductOptions from "@/components/PrintProductOptions";
import { getDateLocale } from "@/i18n/locales";
import { db } from "@/lib/db";
import { inferBookAgeBand } from "@/lib/print-books/ageBand";
import {
  getStorycotIllustrationCountForAgeBand,
  getStorycotPageCountForAgeBand,
} from "@/lib/print-books/printProducts";
import { estimateIllustratedBookCredits } from "@/lib/pricing";
import { getUserCredits } from "@/lib/credits";
import {
  canStartPrintCheckout,
  PRINT_ORDERING_COMING_SOON_MESSAGE,
} from "@/lib/print-books/launch";
import { getEffectiveBookProjectStatus } from "@/lib/print-books/readiness";
import { getBookFileRetentionState } from "@/lib/print-books/retention";
import { isStoryPrintRestricted } from "@/lib/ipGuardrails";
import StoryReader from "./StoryReader";
import ShareButton from "./ShareButton";
import CreatePrintBookButton from "./CreatePrintBookButton";
import BookReader from "../../books/[id]/BookReader";
import BookStatusPanel from "../../books/[id]/BookStatusPanel";
import DigitalDownloadSection from "../../books/[id]/DigitalDownloadSection";
import PrintFulfillmentResendButton from "../../books/[id]/PrintFulfillmentResendButton";

export default async function StoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; locale: string }>;
  searchParams?: Promise<StoryPageSearchParams>;
}) {
  const { userId } = await auth();
  const { id, locale } = await params;
  const query = await (searchParams ?? Promise.resolve({} as StoryPageSearchParams));
  const [t, tBooks] = await Promise.all([
    getTranslations("stories"),
    getTranslations("books"),
  ]);
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

  // Book-derived state
  const effectiveProjectStatus = existingBook
    ? getEffectiveBookProjectStatus(existingBook)
    : null;
  const isBookReady = effectiveProjectStatus === "ready";
  const printOrderingAvailable = canStartPrintCheckout(isAdmin);
  const printRestricted = isStoryPrintRestricted(story);
  const fileRetention = existingBook ? getBookFileRetentionState(existingBook) : null;
  const hasPrintPdf = Boolean(existingBook?.assets.printPdfUrl);
  const hasEpub = Boolean(existingBook?.assets.epubUrl);
  const hasIllustrationsZip = existingBook?.spreads.some(
    (s) =>
      (s.layoutType === "text_art" ||
        s.layoutType === "hero" ||
        s.layoutType === "quiet") &&
      s.leftPageImageUrl &&
      !s.leftPageImageUrl.endsWith(".svg") &&
      !s.leftPageImageUrl.startsWith("data:image/svg")
  ) ?? false;
  const hasDigitalDownload = Boolean(existingBook?.assets.digitalDownloadUnlockedAt);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-5 py-10">
        {/* Title + actions */}
        <div className="mb-6">
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

            <div className="flex shrink-0 flex-wrap items-start gap-2">
              <Link
                href={`/stories/new?profileId=${story.profileId}` as string}
                className="storycot-btn storycot-btn-primary"
              >
                {t("newStoryButton")}
              </Link>
              {isReady && (
                <>
                  {!existingBook && (
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

          {/* Estimate info — shown when no book yet */}
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

          {/* Text exports — always visible when story is ready */}
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

        {/* Download success / cancel banners */}
        {query.download_success ? (
          <div className="mb-8 rounded-3xl border border-green-200 bg-green-50 p-6 text-green-900 shadow-sm">
            <p className="font-display text-2xl font-bold">
              Digital download unlocked!
            </p>
            <p className="mt-2 leading-7">
              Your illustrated PDF and EPUB are ready to download below.
            </p>
          </div>
        ) : null}
        {query.download_canceled ? (
          <div className="mb-8 rounded-3xl border border-star-200 bg-star-50 p-6 text-night-700 shadow-sm">
            <p className="font-display text-2xl font-bold text-night-800">
              Download checkout was cancelled
            </p>
            <p className="mt-2 leading-7">
              No payment was taken. Your illustrated book is still here whenever
              you want to download it.
            </p>
          </div>
        ) : null}
        {query.print_success ? (
          <div className="mb-8 rounded-3xl border border-green-200 bg-green-50 p-6 text-green-900 shadow-sm">
            <p className="font-display text-2xl font-bold">
              Your printed book order is paid
            </p>
            <p className="mt-2 leading-7">
              We&apos;ve received the print checkout. Next, we&apos;ll review
              the files and prepare the finished book for Australian fulfilment.
            </p>
          </div>
        ) : null}
        {query.print_canceled ? (
          <div className="mb-8 rounded-3xl border border-star-200 bg-star-50 p-6 text-night-700 shadow-sm">
            <p className="font-display text-2xl font-bold text-night-800">
              Print checkout was cancelled
            </p>
            <p className="mt-2 leading-7">
              No payment was taken. Your illustrated book is still ready here
              whenever you want to choose a print format.
            </p>
          </div>
        ) : null}

        {/* Print order status */}
        {existingBook?.printOrder?.status === "paid" ? (
          <section className="mb-8 rounded-3xl border border-moon-200 bg-moon-50 p-8 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-wide text-star-700">
              Print order
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold text-night-800">
              {(() => {
                const f = existingBook.printOrder!.fulfillment;
                if (
                  !f ||
                  f.status === "not_configured" ||
                  f.status === "ready_for_manual_review"
                )
                  return "Order received";
                if (f.status === "submitted") return "Sent to print";
                if (f.status === "failed") return "Order needs attention";
                return "Order received";
              })()}
            </h2>
            <p className="mt-1 text-night-500">
              {existingBook.printOrder.productLabel} ·{" "}
              {existingBook.printOrder.format} ·{" "}
              {existingBook.printOrder.amountAud.toLocaleString("en-AU", {
                style: "currency",
                currency: "AUD",
              })}
            </p>
            {(() => {
              const f = existingBook.printOrder!.fulfillment;
              if (f?.status === "submitted") {
                return (
                  <div className="mt-5 space-y-3">
                    <p className="leading-7 text-night-600">
                      Your book is with the printer. Lulu will send you a
                      dispatch email with tracking once it ships — check the
                      inbox you used at checkout.
                    </p>
                    <div className="rounded-2xl bg-white/70 px-4 py-3 text-sm text-night-600">
                      <p className="font-semibold text-night-800">
                        What to expect
                      </p>
                      <p className="mt-1">Production: 3–5 business days</p>
                      <p>Delivery to Australia: a further 5–7 business days</p>
                    </div>
                    {f.externalOrderId ? (
                      <p className="text-xs text-night-400">
                        Printer ref: {f.externalOrderId}
                      </p>
                    ) : null}
                  </div>
                );
              }
              if (f?.status === "failed") {
                return (
                  <>
                    <p className="mt-4 leading-7 text-blush-600">
                      There was a problem sending your order to the printer. Our
                      team has been notified and will sort it out — no further
                      action needed from you.
                    </p>
                    {isAdmin ? (
                      <PrintFulfillmentResendButton
                        bookId={existingBook.id}
                        provider={existingBook.printOrder.provider}
                      />
                    ) : null}
                  </>
                );
              }
              return (
                <div className="mt-5 space-y-3">
                  <p className="leading-7 text-night-600">
                    Payment received — your book is being prepared for print.
                    You&apos;ll get a dispatch email with tracking once it
                    ships.
                  </p>
                  <div className="rounded-2xl bg-white/70 px-4 py-3 text-sm text-night-600">
                    <p className="font-semibold text-night-800">
                      What to expect
                    </p>
                    <p className="mt-1">Production: 3–5 business days</p>
                    <p>Delivery to Australia: a further 5–7 business days</p>
                  </div>
                  {isAdmin ? (
                    <PrintFulfillmentResendButton
                      bookId={existingBook.id}
                      provider={existingBook.printOrder.provider}
                    />
                  ) : null}
                </div>
              );
            })()}
          </section>
        ) : null}

        {/* Reader — illustrated when book ready, text-only otherwise */}
        {isBookReady && existingBook && existingBook.spreads.length > 0 ? (
          <section className="mb-8">
            <BookReader project={existingBook} isAdmin={isAdmin} />
          </section>
        ) : (
          <StoryReader story={story} />
        )}

        {/* Book build progress — when book exists but not yet ready */}
        {existingBook && !isBookReady ? (
          <div className="mt-8">
            <BookStatusPanel
              initialProject={existingBook}
              initialIsReady={false}
            />
          </div>
        ) : null}

        {/* Purchases + downloads — when book is ready */}
        {isBookReady && existingBook ? (
          <section className="mt-8">
            <h2 className="mb-2 font-display text-2xl font-bold text-night-800">
              {tBooks("illustratedPdfReadyTitle")}
            </h2>
            <p className="mb-6 text-night-500">
              {tBooks("illustratedPdfReadySub")}
            </p>

            <div id="digital-download" className="grid gap-5 sm:grid-cols-2">
              {/* Digital download */}
              {!fileRetention?.isArchived ? (
                <DigitalDownloadSection
                  projectId={existingBook.id}
                  hasDigitalDownload={hasDigitalDownload || isAdmin}
                  hasPrintPdf={hasPrintPdf}
                  hasEpub={hasEpub}
                  hasIllustrationsZip={hasIllustrationsZip}
                  storyTitle={story.title}
                />
              ) : (
                <div className="rounded-2xl border border-night-100 bg-white p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-night-400">
                    Digital download
                  </p>
                  <p className="mt-2 text-sm text-night-500">
                    Download files have been archived. Use Refresh PDFs below to
                    regenerate them.
                  </p>
                </div>
              )}

              {/* Hardcover */}
              {!printRestricted ? (
                <div className="flex flex-col">
                  {printOrderingAvailable ? (
                    <PrintProductOptions
                      project={existingBook}
                      orderingAvailable={printOrderingAvailable}
                    />
                  ) : (
                    <div className="flex h-full flex-col rounded-2xl border border-night-100 bg-white p-5 shadow-sm">
                      <p className="text-xs font-bold uppercase tracking-wide text-star-600">
                        Keepsake
                      </p>
                      <h3 className="mt-1 font-display text-2xl font-bold text-night-800">
                        Hardcover
                      </h3>
                      <p className="mt-3 text-sm leading-6 text-night-500">
                        A giftable keepsake edition with a rigid casewrap cover
                        and premium colour pages — printed and delivered to
                        Australia.
                      </p>
                      <div className="mt-4 rounded-2xl bg-night-50 p-4">
                        <p className="font-display text-2xl font-bold text-night-800">
                          $39.95
                        </p>
                        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-night-400">
                          Estimated AU print price
                        </p>
                      </div>
                      <p className="mt-4 rounded-xl bg-moon-50 px-3 py-2 text-sm font-bold text-night-700">
                        {PRINT_ORDERING_COMING_SOON_MESSAGE}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-night-100 bg-white p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-star-600">
                    Hardcover
                  </p>
                  <div className="mt-4 rounded-2xl border border-star-200 bg-star-50 p-4 text-sm leading-6 text-night-700">
                    <p className="font-bold text-night-800">
                      Printed ordering unavailable
                    </p>
                    <p className="mt-1">
                      This story includes protected characters or source
                      material. Create an original version to order through
                      Storycot.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {/* Admin tools */}
        {isAdmin && isBookReady && existingBook ? (
          <section className="mt-8 rounded-3xl border border-night-100 bg-white/80 p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-night-400">
              Admin tools
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              {existingBook.assets.luluPrintPdfUrl ? (
                <FileDownloadButton
                  href={`/api/books/${existingBook.id}/download?asset=luluPrintPdf`}
                  className="storycot-btn storycot-btn-secondary"
                  label="Lulu interior PDF"
                  pendingLabel={tBooks("downloadStarting")}
                />
              ) : (
                <button
                  type="button"
                  disabled
                  className="storycot-btn storycot-btn-secondary opacity-50"
                >
                  Lulu interior missing
                </button>
              )}
              {existingBook.assets.luluCoverPdfUrl ? (
                <FileDownloadButton
                  href={`/api/books/${existingBook.id}/download?asset=luluCoverPdf`}
                  className="storycot-btn storycot-btn-secondary"
                  label="Lulu cover PDF"
                  pendingLabel={tBooks("downloadStarting")}
                />
              ) : (
                <button
                  type="button"
                  disabled
                  className="storycot-btn storycot-btn-secondary opacity-50"
                >
                  Lulu cover missing
                </button>
              )}
              {fileRetention?.availableUntil ? (
                <p className="w-full text-xs text-night-400">
                  Files retained until{" "}
                  {new Intl.DateTimeFormat("en-AU", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  }).format(new Date(fileRetention.availableUntil))}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}

type StoryPageSearchParams = {
  print_success?: string;
  print_canceled?: string;
  download_success?: string;
  download_canceled?: string;
};
