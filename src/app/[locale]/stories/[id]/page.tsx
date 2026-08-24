import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import Nav from "@/components/Nav";
import FileDownloadButton from "@/components/FileDownloadButton";
import DeleteStoryButton from "@/components/DeleteStoryButton";
import PrintProductOptions from "@/components/PrintProductOptions";
import Icon from "@/components/ui/Icon";
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
import {
  getEffectiveStoryIpPolicy,
  isStoryPrintRestricted,
} from "@/lib/ipGuardrails";
import { loadBuildContext } from "@/lib/print-books/jobs/context";
import StoryReader from "./StoryReader";
import ShareButton from "./ShareButton";
import PublicSubmissionPanel from "./PublicSubmissionPanel";
import StoryEditPanel from "./StoryEditPanel";
import CreatePrintBookButton from "./CreatePrintBookButton";
import CheckoutResultNotice from "./CheckoutResultNotice";
import StoryTextExports from "./StoryTextExports";
import BookReader from "../../books/[id]/BookReader";
import BookStatusPanel from "../../books/[id]/BookStatusPanel";
import DigitalDownloadSection from "../../books/[id]/DigitalDownloadSection";
import PrintFulfillmentResendButton from "../../books/[id]/PrintFulfillmentResendButton";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const story = await db.stories.getById(id);
  return { title: story ? `${story.title} - Storycot` : "Story - Storycot" };
}

export default async function StoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; locale: string }>;
  searchParams?: Promise<StoryPageSearchParams>;
}) {
  const { userId } = await auth();
  const { id, locale } = await params;
  const query = await (searchParams ??
    Promise.resolve({} as StoryPageSearchParams));
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

  // Prefer an active/ready book. Otherwise surface a book that failed during
  // illustration (recoverable via the "retry failed images" panel) so the user
  // isn't bounced back to a fresh "Generate" button with no way to resume.
  const existingBook =
    bookProjects.find((p) => p.status !== "failed") ??
    bookProjects.find((p) => p.errorCode === "illustrating:image_failed") ??
    null;
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
  const printIpPolicy = getEffectiveStoryIpPolicy(story);
  const printRestricted = isStoryPrintRestricted(story);
  const printRestrictionMatches = printIpPolicy?.matchedTerms ?? [];
  const hasSourceStyleRestriction = Boolean(
    printIpPolicy?.reasons.includes("source_or_style_reference")
  );
  const fileRetention = existingBook
    ? getBookFileRetentionState(existingBook)
    : null;
  const hasPrintPdf = Boolean(existingBook?.assets.printPdfUrl);
  const hasEpub = Boolean(existingBook?.assets.epubUrl);
  const hasIllustrationsZip =
    existingBook?.spreads.some(
      (s) =>
        (s.layoutType === "text_art" ||
          s.layoutType === "hero" ||
          s.layoutType === "quiet") &&
        s.leftPageImageUrl &&
        !s.leftPageImageUrl.endsWith(".svg") &&
        !s.leftPageImageUrl.startsWith("data:image/svg")
    ) ?? false;
  const hasDigitalDownload = Boolean(
    existingBook?.assets.digitalDownloadUnlockedAt
  );
  const shareableThumbnails =
    await db.bookProjects.getPublicThumbnailsByStoryIds([id]);
  const hasShareableIllustratedBook = Boolean(shareableThumbnails[id]);
  const buildContext = existingBook
    ? await loadBuildContext(existingBook).catch(() => null)
    : null;
  const initialReferencesAreStale = Boolean(
    existingBook &&
      buildContext?.referenceSnapshotKey &&
      existingBook.assets.referenceSnapshotKey !==
        buildContext.referenceSnapshotKey
  );

  // Rendered above the reader while the book is still building (so progress is
  // visible without scrolling) and below the reader once it's ready.
  const bookStatusPanel = existingBook ? (
    <BookStatusPanel
      initialProject={existingBook}
      initialIsReady={isBookReady}
      initialReferencesAreStale={initialReferencesAreStale}
      initialReferenceImageCount={buildContext?.visualReferences.length ?? 0}
      isAdmin={isAdmin}
    />
  ) : null;

  return (
    <>
      <Nav />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-4xl px-5 py-10"
      >
        {/* Title + actions */}
        <div className="mb-6">
          <div>
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
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link
              href={`/stories/new?profileId=${story.profileId}` as string}
              className="storycot-btn storycot-btn-primary storycot-btn-compact"
            >
              <Icon name="plus" />
              New story
            </Link>
            {isReady ? (
              <>
                {hasShareableIllustratedBook ? (
                  <ShareButton storyId={id} />
                ) : null}
                <StoryTextExports
                  storyId={id}
                  storyTitle={story.title}
                  compact
                />
                {isAdmin && isBookReady && existingBook ? (
                  <>
                    {existingBook.assets.luluPrintPdfUrl ? (
                      <FileDownloadButton
                        href={`/api/books/${existingBook.id}/download?asset=luluPrintPdf`}
                        className="storycot-btn storycot-btn-secondary storycot-btn-compact"
                        icon={<Icon name="file" />}
                        label="Lulu interior"
                        pendingLabel={tBooks("downloadStarting")}
                      />
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="storycot-btn storycot-btn-secondary storycot-btn-compact opacity-50"
                      >
                        Lulu interior missing
                      </button>
                    )}
                    {existingBook.assets.luluCoverPdfUrl ? (
                      <FileDownloadButton
                        href={`/api/books/${existingBook.id}/download?asset=luluCoverPdf`}
                        className="storycot-btn storycot-btn-secondary storycot-btn-compact"
                        icon={<Icon name="file" />}
                        label="Lulu cover"
                        pendingLabel={tBooks("downloadStarting")}
                      />
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="storycot-btn storycot-btn-secondary storycot-btn-compact opacity-50"
                      >
                        Lulu cover missing
                      </button>
                    )}
                  </>
                ) : null}
                <DeleteStoryButton storyId={id} redirectTo="/stories" compact />
              </>
            ) : null}
          </div>
          {isAdmin &&
          isBookReady &&
          existingBook &&
          fileRetention?.availableUntil ? (
            <p className="mt-2 text-xs text-night-400">
              Admin files retained until{" "}
              {new Intl.DateTimeFormat("en-AU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              }).format(new Date(fileRetention.availableUntil))}
            </p>
          ) : null}
        </div>

        {/* Illustrate CTA - prominent, above the reader so the next step is
            obvious without scrolling past the whole story */}
        {isReady && !existingBook ? (
          <div className="mb-8 rounded-2xl border border-star-200 bg-gradient-to-br from-star-50 to-lilac-50 p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Icon name="sparkle" className="h-5 w-5 text-star-500" />
                <p className="font-display text-lg font-bold text-night-800">
                  {tBooks("estimateTitle")}
                </p>
              </div>
              <p className="mt-1 text-sm text-night-600">
                {tBooks("estimateBody", {
                  credits: illustrationEstimate.credits,
                  pages: estimatedPageCount,
                  illustrations: estimatedIllustrationCount,
                })}
              </p>
            </div>
            <div className="mt-4 flex shrink-0 flex-col items-start gap-2 sm:mt-0 sm:items-end">
              <CreatePrintBookButton
                storyId={id}
                credits={illustrationEstimate.credits}
                pageCount={estimatedPageCount}
                illustrationCount={estimatedIllustrationCount}
                userCredits={userCredits}
                isAdmin={isAdmin}
                compact
              />
            </div>
          </div>
        ) : null}

        {/* Download success / cancel banners */}
        {query.download_success ? (
          <CheckoutResultNotice
            tone="success"
            title="Digital download unlocked!"
            body="Your illustrated PDF and e-reader file are ready to download below."
          />
        ) : null}
        {query.download_canceled ? (
          <CheckoutResultNotice
            tone="warning"
            title="Download checkout was cancelled"
            body="No payment was taken. Your illustrated book is still here whenever you want to download it."
          />
        ) : null}
        {query.print_success ? (
          <CheckoutResultNotice
            tone="success"
            title="Your printed book order is paid"
            body="We've received the print checkout. Next, we'll review the files and prepare the finished book for Australian fulfilment."
          />
        ) : null}
        {query.print_canceled ? (
          <CheckoutResultNotice
            tone="warning"
            title="Print checkout was cancelled"
            body="No payment was taken. Your illustrated book is still ready here whenever you want to order a hardcover."
          />
        ) : null}

        {/* Print order status */}
        {existingBook?.printOrder?.status === "paid" ? (
          <section className="mb-8 rounded-3xl border border-moon-200 bg-moon-50 p-8 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-wide text-star-700">
              Print order
            </p>
            {/* Status stepper */}
            {(() => {
              const f = existingBook.printOrder!.fulfillment;
              const isShipped =
                f?.status === "shipped" || f?.status === "delivered";
              const isInProd = f?.status === "submitted";
              const steps = [
                { label: "Order received", done: true },
                { label: "In production", done: isInProd || isShipped },
                { label: "Shipped", done: isShipped },
              ];
              return (
                <div className="mt-4 flex items-center gap-0">
                  {steps.map((step, i) => (
                    <div key={i} className="flex flex-1 items-center">
                      <div className="flex flex-col items-center">
                        <div
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step.done ? "bg-star-600 text-white" : "bg-night-100 text-night-400"}`}
                        >
                          {step.done ? "✓" : i + 1}
                        </div>
                        <p
                          className={`mt-1 text-center text-xs font-medium ${step.done ? "text-night-700" : "text-night-400"}`}
                        >
                          {step.label}
                        </p>
                      </div>
                      {i < steps.length - 1 ? (
                        <div
                          className={`mb-4 h-0.5 flex-1 ${steps[i + 1]?.done ? "bg-star-400" : "bg-night-100"}`}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              );
            })()}
            <p className="mt-4 text-sm text-night-500">
              {existingBook.printOrder.productLabel} ·{" "}
              {existingBook.printOrder.format} ·{" "}
              {existingBook.printOrder.amountAud.toLocaleString("en-AU", {
                style: "currency",
                currency: "AUD",
              })}
            </p>
            {(() => {
              const f = existingBook.printOrder!.fulfillment;
              if (f?.status === "shipped" || f?.status === "delivered") {
                return (
                  <div className="mt-5 space-y-3">
                    <p className="leading-7 text-night-600">
                      {f.status === "delivered"
                        ? "Your book has been delivered. We hope your little one loves it!"
                        : "Your book is on its way!"}
                    </p>
                    {f.trackingUrl ? (
                      <a
                        href={f.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-full bg-night-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-night-700"
                      >
                        Track my parcel →
                      </a>
                    ) : null}
                  </div>
                );
              }
              if (f?.status === "submitted") {
                return (
                  <div className="mt-5 space-y-3">
                    <p className="leading-7 text-night-600">
                      Your book is in production. Check back here for shipping
                      updates.
                    </p>
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
                      team has been notified and will sort it out - no further
                      action needed from you.
                    </p>
                    <a
                      href="mailto:hello@storycot.com"
                      className="mt-3 inline-block text-sm font-bold text-blush-700 underline underline-offset-2 hover:text-blush-900"
                    >
                      Email us if you have questions →
                    </a>
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
                    Payment received - your book is being prepared for print.
                    Check back here to follow your order status.
                  </p>
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

        {/* While building, surface the illustration progress ABOVE the reader
            so users see it without scrolling past the whole story. */}
        {existingBook && !isBookReady ? (
          <div className="mb-8">{bookStatusPanel}</div>
        ) : null}

        {/* Reader - illustrated when book ready, text-only otherwise */}
        {isBookReady && existingBook && existingBook.spreads.length > 0 ? (
          <section className="mb-8">
            <BookReader project={existingBook} isAdmin={isAdmin} />
          </section>
        ) : (
          <StoryReader story={story} />
        )}

        {/* Once ready, the panel sits below the illustrated reader (for export
            actions + artwork redo). */}
        {existingBook && isBookReady ? (
          <div className="mt-8">{bookStatusPanel}</div>
        ) : null}

        {isReady && story.publicReviewStatus === "rejected" ? (
          <StoryEditPanel story={story} />
        ) : null}

        {/* Purchases + downloads - when book is ready */}
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
                        and premium colour pages - printed and delivered to
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
                    {printRestrictionMatches.length > 0 ||
                    hasSourceStyleRestriction ? (
                      <div className="mt-3 rounded-xl bg-white/70 px-3 py-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-night-400">
                          Possible conflict
                        </p>
                        {printRestrictionMatches.length > 0 ? (
                          <p className="mt-1 font-bold text-night-800">
                            {printRestrictionMatches.join(", ")}
                          </p>
                        ) : null}
                        {hasSourceStyleRestriction ? (
                          <p className="mt-1 text-night-700">
                            Source/style wording such as “looks like”, “from the
                            movie”, “official character”, “brand”, or “logo”.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {isReady ? (
          <PublicSubmissionPanel
            story={story}
            canSubmitPublicly={hasShareableIllustratedBook}
            hasIllustratedBookProject={Boolean(existingBook)}
          />
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
