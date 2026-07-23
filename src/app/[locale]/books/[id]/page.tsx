import { notFound, redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import Nav from "@/components/Nav";
import DeleteBookButton from "@/components/DeleteBookButton";
import FileDownloadButton from "@/components/FileDownloadButton";
import PrintProductOptions from "@/components/PrintProductOptions";
import { db } from "@/lib/db";
import { isStoryPrintRestricted } from "@/lib/ipGuardrails";
import {
  canStartPrintCheckout,
  PRINT_ORDERING_COMING_SOON_MESSAGE,
} from "@/lib/print-books/launch";
import { getEffectiveBookProjectStatus } from "@/lib/print-books/readiness";
import { getBookFileRetentionState } from "@/lib/print-books/retention";
import BookStatusPanel from "./BookStatusPanel";
import BookReader from "./BookReader";
import DigitalDownloadSection from "./DigitalDownloadSection";
import PrintFulfillmentResendButton from "./PrintFulfillmentResendButton";

export default async function BookProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<BookProjectSearchParams>;
}) {
  const [{ userId }, { id }, query] = await Promise.all([
    auth(),
    params,
    searchParams ?? Promise.resolve({} as BookProjectSearchParams),
  ]);
  if (!userId) redirect("/sign-in");

  const [t, project] = await Promise.all([
    getTranslations("books"),
    db.bookProjects.getById(id),
  ]);
  if (!project || project.userId !== userId) notFound();

  const [story, client] = await Promise.all([
    db.stories.getById(project.sourceStoryId),
    clerkClient(),
  ]);
  if (!story || story.userId !== userId) notFound();
  const user = await client.users.getUser(userId);
  const isAdmin = user.privateMetadata.isAdmin === true;
  const printOrderingAvailable = canStartPrintCheckout(isAdmin);
  const effectiveProjectStatus = getEffectiveBookProjectStatus(project);

  const hasPrintPdf = Boolean(project.assets.printPdfUrl);
  const hasEpub = Boolean(project.assets.epubUrl);
  const hasLuluPrintPdf = Boolean(project.assets.luluPrintPdfUrl);
  const hasLuluCoverPdf = Boolean(project.assets.luluCoverPdfUrl);
  const hasDigitalDownload = Boolean(project.assets.digitalDownloadUnlockedAt);
  const fileRetention = getBookFileRetentionState(project);
  const printRestricted = isStoryPrintRestricted(story);
  const isReady = effectiveProjectStatus === "ready";

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-5 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-2 text-sm text-night-400">
            <Link
              href={`/stories/${story.id}` as string}
              className="hover:text-night-600"
            >
              {t("backToStory")}
            </Link>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-4xl font-bold text-night-800">
                {isReady
                  ? t("illustratedPdfReadyTitle")
                  : t("illustratedPdfTitle")}
              </h1>
              <p className="mt-2 text-night-500">
                {isReady
                  ? t("illustratedPdfReadyPageSub", { title: story.title })
                  : t("illustratedPdfPageSub", { title: story.title })}
              </p>
            </div>
            <DeleteBookButton
              bookId={project.id}
              redirectTo={`/stories/${story.id}`}
            />
          </div>
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

        {/* Print order success / cancel banners */}
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
        {project.printOrder?.status === "paid" ? (
          <section className="mb-8 rounded-3xl border border-moon-200 bg-moon-50 p-8 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-wide text-star-700">
              Print order
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold text-night-800">
              {(() => {
                const f = project.printOrder!.fulfillment;
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
              {project.printOrder.productLabel} · {project.printOrder.format} ·{" "}
              {project.printOrder.amountAud.toLocaleString("en-AU", {
                style: "currency",
                currency: "AUD",
              })}
            </p>

            {(() => {
              const f = project.printOrder!.fulfillment;
              if (f?.status === "submitted") {
                return (
                  <div className="mt-5 space-y-3">
                    <p className="leading-7 text-night-600">
                      Your book is with the printer. Prodigi will send you a
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
                        bookId={project.id}
                        provider={project.printOrder.provider}
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
                      bookId={project.id}
                      provider={project.printOrder.provider}
                    />
                  ) : null}
                </div>
              );
            })()}
          </section>
        ) : null}

        {/* Book reader — shown when ready and there are illustrated spreads */}
        {isReady && project.spreads.length > 0 ? (
          <section className="mb-8">
            <h2 className="mb-4 font-display text-2xl font-bold text-night-800">
              Read your book
            </h2>
            <BookReader project={project} />
          </section>
        ) : null}

        {/* Build progress panel */}
        <BookStatusPanel initialProject={project} />

        {/* Purchase tiers — shown when book is ready */}
        {isReady ? (
          <section className="mt-8">
            <h2 className="mb-2 font-display text-2xl font-bold text-night-800">
              Get your book
            </h2>
            <p className="mb-6 text-night-500">
              Choose how you want to keep this story forever.
            </p>

            <div className="grid gap-5 sm:grid-cols-2">
              {/* Tier 1 — Digital download */}
              {!fileRetention.isArchived ? (
                <DigitalDownloadSection
                  projectId={project.id}
                  hasDigitalDownload={hasDigitalDownload || isAdmin}
                  hasPrintPdf={hasPrintPdf}
                  hasEpub={hasEpub}
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

              {/* Tier 2 — Hardcover */}
              {!printRestricted ? (
                <div className="flex flex-col">
                  {printOrderingAvailable ? (
                    <PrintProductOptions
                      project={project}
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

        {/* Admin Lulu tools */}
        {isAdmin && isReady ? (
          <section className="mt-8 rounded-3xl border border-night-100 bg-white/80 p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-night-400">
              Admin tools
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              {hasLuluPrintPdf ? (
                <FileDownloadButton
                  href={`/api/books/${project.id}/download?asset=luluPrintPdf`}
                  className="storycot-btn storycot-btn-secondary"
                  label="Lulu interior PDF"
                  pendingLabel={t("downloadStarting")}
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
              {hasLuluCoverPdf ? (
                <FileDownloadButton
                  href={`/api/books/${project.id}/download?asset=luluCoverPdf`}
                  className="storycot-btn storycot-btn-secondary"
                  label="Lulu cover PDF"
                  pendingLabel={t("downloadStarting")}
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
              {fileRetention.availableUntil ? (
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

type BookProjectSearchParams = {
  print_success?: string;
  print_canceled?: string;
  download_success?: string;
  download_canceled?: string;
};
