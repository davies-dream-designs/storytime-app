import {
  getPrintProductQuotes,
  type PrintProductQuote,
} from "@/lib/print-books/printProducts";
import type { BookProject } from "@/types/printBook";
import PrintCheckoutButton from "@/components/PrintCheckoutButton";
import { getTranslations } from "next-intl/server";

function formatAud(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}

function ProductCard({
  quote,
  projectId,
  orderingAvailable,
  comingSoonLabel,
  estimatedPriceLabel,
  printPagesLabel,
}: {
  quote: PrintProductQuote;
  projectId: string;
  orderingAvailable: boolean;
  comingSoonLabel: string;
  estimatedPriceLabel: string;
  printPagesLabel: string;
}) {
  const canOrder =
    quote.isWithinSpecs && !quote.pricingUnavailable && orderingAvailable;

  return (
    <article className="flex min-h-full flex-col rounded-2xl border border-night-100 bg-white p-5 shadow-sm">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-star-600">
          {quote.badge}
        </p>
        <h3 className="mt-1 font-display text-2xl font-bold text-night-800">
          {quote.label}
        </h3>
      </div>
      <p className="mt-3 text-sm leading-6 text-night-500">
        {quote.format}. {quote.description} Printed to order and shipped in
        Australia. Includes the digital PDF, e-reader file, illustrations,
        and narration.
      </p>
      <div className="mt-4 space-y-2 text-sm text-night-600">
        <div className="flex items-center justify-between gap-3 border-t border-night-100 pt-3">
          <span className="text-night-500">{estimatedPriceLabel}</span>
          <span className="font-bold text-night-800">
            {quote.priceAud !== undefined
              ? `${formatAud(quote.priceAud)} + shipping`
              : "Pricing unavailable"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-night-100 pt-3">
          <span className="text-night-500">Digital bundle</span>
          <span className="text-right font-medium">Included</span>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-night-100 pt-3">
          <span className="text-night-500">{printPagesLabel}</span>
          <span className="text-right font-medium">
            {quote.pageCount}
            {quote.needsPadding
              ? ` (${quote.paddingPages} quiet pages added)`
              : ""}
          </span>
        </div>
      </div>
      {quote.unsupportedReason ? (
        <p className="mt-4 rounded-xl bg-star-50 px-3 py-2 text-sm font-bold text-night-700">
          {quote.unsupportedReason}
        </p>
      ) : quote.pricingUnavailable ? (
        <p className="mt-4 rounded-xl bg-star-50 px-3 py-2 text-sm font-bold text-night-700">
          We couldn&apos;t fetch a live price for this format right now.
          Please check back shortly.
        </p>
      ) : null}
      {!orderingAvailable && quote.isWithinSpecs ? (
        <p className="mt-4 rounded-xl bg-moon-50 px-3 py-2 text-sm font-bold text-night-700">
          {comingSoonLabel}
        </p>
      ) : null}
      <div className="mt-auto">
        <PrintCheckoutButton
          projectId={projectId}
          productKey={quote.key}
          productLabel={quote.label}
          priceAud={quote.priceAud}
          disabled={!canOrder}
          label={orderingAvailable ? `Order ${quote.label.toLowerCase()}` : comingSoonLabel}
        />
      </div>
    </article>
  );
}

export default async function PrintProductOptions({
  project,
  orderingAvailable,
}: {
  project: Pick<BookProject, "id" | "pageCount" | "assets">;
  orderingAvailable: boolean;
}) {
  const t = await getTranslations("books");
  const effectivePageCount =
    project.assets.luluPrintPdfPageCount ?? project.pageCount;
  const quotes = await getPrintProductQuotes({
    pageCount: effectivePageCount,
  });

  if (quotes.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {quotes.map((quote) => (
        <ProductCard
          key={quote.key}
          quote={quote}
          projectId={project.id}
          orderingAvailable={orderingAvailable}
          comingSoonLabel={t("comingSoon")}
          estimatedPriceLabel={t("estimatedPrice")}
          printPagesLabel={t("printPages")}
        />
      ))}
    </div>
  );
}
