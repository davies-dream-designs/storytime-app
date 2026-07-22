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
import { getBookFileRetentionState } from "@/lib/print-books/retention";
import BookStatusPanel from "./BookStatusPanel";
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

  const hasPrintPdf = Boolean(project.assets.printPdfUrl);
  const hasEpub = Boolean(project.assets.epubUrl);
  const hasLuluPrintPdf = Boolean(project.assets.luluPrintPdfUrl);
  const hasLuluCoverPdf = Boolean(project.assets.luluCoverPdfUrl);
  const fileRetention = getBookFileRetentionState(project);
  const printRestricted = isStoryPrintRestricted(story);
  const fileRetentionDate = fileRetention.availableUntil
    ? new Intl.DateTimeFormat("en-AU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(fileRetention.availableUntil))
    : undefined;

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
          <div className="mt-5 rounded-2xl border border-night-100 bg-white/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-night-800">
                  Book files
                </p>
                {fileRetention.isArchived ? (
                  <p className="mt-1 text-sm text-night-500">
                    High-resolution download and print files have been archived.
                    Your story is still saved; use Refresh PDFs below to prepare
                    fresh files.
                  </p>
                ) : fileRetentionDate ? (
                  <p className="mt-1 text-sm text-night-500">
                    Download and print-ready files are kept available until{" "}
                    {fileRetentionDate}. Your story stays in your library after
                    that.
                  </p>
                ) : isAdmin && (!hasLuluPrintPdf || !hasLuluCoverPdf) ? (
                  <p className="mt-1 text-sm text-night-500">
                    Refresh the PDF exports to generate Lulu-specific print
                    files for this book.
                  </p>
                ) : null}
              </div>
              <DeleteBookButton
                bookId={project.id}
                redirectTo={`/stories/${story.id}`}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              {hasPrintPdf ? (
                <FileDownloadButton
                  href={`/api/books/${project.id}/download?asset=printPdf`}
                  className="storycot-btn storycot-btn-primary"
                  label={t("illustratedPdfButton")}
                  pendingLabel={t("downloadStarting")}
                />
              ) : null}
              {hasEpub ? (
                <FileDownloadButton
                  href={`/api/books/${project.id}/download?asset=epub`}
                  shareTitle={story.title}
                  label={t("epubButton")}
                  pendingLabel={t("downloadStarting")}
                  className="storycot-btn storycot-btn-secondary"
                  shareWhenAvailable
                />
              ) : null}
              {isAdmin && hasLuluPrintPdf ? (
                <FileDownloadButton
                  href={`/api/books/${project.id}/download?asset=luluPrintPdf`}
                  className="storycot-btn storycot-btn-secondary"
                  label="Lulu interior PDF"
                  pendingLabel={t("downloadStarting")}
                />
              ) : null}
              {isAdmin && !hasLuluPrintPdf ? (
                <button
                  type="button"
                  disabled
                  className="storycot-btn storycot-btn-secondary opacity-50"
                >
                  Lulu interior missing
                </button>
              ) : null}
              {isAdmin && hasLuluCoverPdf ? (
                <FileDownloadButton
                  href={`/api/books/${project.id}/download?asset=luluCoverPdf`}
                  className="storycot-btn storycot-btn-secondary"
                  label="Lulu cover PDF"
                  pendingLabel={t("downloadStarting")}
                />
              ) : null}
              {isAdmin && !hasLuluCoverPdf ? (
                <button
                  type="button"
                  disabled
                  className="storycot-btn storycot-btn-secondary opacity-50"
                >
                  Lulu cover missing
                </button>
              ) : null}
            </div>
          </div>
          {hasEpub ? (
            <p className="mt-3 text-sm leading-6 text-night-500">
              {t("epubHelp")}
            </p>
          ) : null}
        </div>

        {query.print_success ? (
          <div className="mb-8 rounded-3xl border border-green-200 bg-green-50 p-6 text-green-900 shadow-sm">
            <p className="font-display text-2xl font-bold">
              Your printed book order is paid
            </p>
            <p className="mt-2 leading-7">
              We’ve received the print checkout. Next, we’ll review the files
              and prepare the finished book for Australian fulfilment.
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

        <BookStatusPanel initialProject={project} />

        {project.status === "ready" ? (
          <section className="mt-8 rounded-3xl border border-night-100 bg-white p-8 shadow-sm">
            <h2 className="font-display text-2xl font-bold text-night-800">
              {t("printOptionsTitle")}
            </h2>
            {printRestricted ? (
              <div className="mt-4 rounded-2xl border border-star-200 bg-star-50 p-4 text-sm leading-6 text-night-700">
                <p className="font-bold text-night-800">
                  Printed ordering is unavailable for this story
                </p>
                <p className="mt-1">
                  You can still download the PDF or EPUB for personal review,
                  but Storycot can only send original stories to Australian
                  print fulfilment. Create an original version without protected
                  characters, brands, logos, or recognisable source worlds to
                  order through Lulu.
                </p>
              </div>
            ) : (
              <>
                <p className="mt-2 text-night-600">{t("printOptionsSub")}</p>
                <div className="mt-6">
                  <PrintProductOptions project={project} />
                </div>
              </>
            )}
          </section>
        ) : null}
      </main>
    </>
  );
}

type BookProjectSearchParams = {
  print_success?: string;
  print_canceled?: string;
};
