import { getPrintProductQuotes } from "@/lib/print-books/printProducts";
import type { BookProject } from "@/types/printBook";

function formatAud(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}

export default function PrintProductOptions({
  project,
}: {
  project: Pick<BookProject, "pageCount">;
}) {
  const quotes = getPrintProductQuotes(project);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {quotes.map((quote) => (
        <article
          key={quote.key}
          className="flex min-h-full flex-col rounded-2xl border border-night-100 bg-white p-5 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-star-600">
                {quote.badge}
              </p>
              <h3 className="mt-1 font-display text-2xl font-bold text-night-800">
                {quote.label}
              </h3>
            </div>
            <p className="rounded-full bg-moon-100 px-3 py-1 text-xs font-bold text-night-600">
              {quote.provider}
            </p>
          </div>
          <p className="mt-3 text-sm leading-6 text-night-500">
            {quote.description}
          </p>
          <div className="mt-4 rounded-2xl bg-night-50 p-4">
            <p className="font-display text-2xl font-bold text-night-800">
              {formatAud(quote.priceAud)}
            </p>
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-night-400">
              Estimated AU print price
            </p>
          </div>
          <dl className="mt-4 space-y-2 text-sm text-night-600">
            <div className="flex justify-between gap-3">
              <dt>Format</dt>
              <dd className="text-right font-medium">{quote.format}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Print pages</dt>
              <dd className="text-right font-medium">
                {quote.pageCount}
                {quote.needsPadding
                  ? ` (${quote.paddingPages} quiet pages added)`
                  : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Production</dt>
              <dd className="text-right font-medium">{quote.productionDays}</dd>
            </div>
          </dl>
          <button
            type="button"
            disabled
            className="storycot-btn storycot-btn-secondary mt-5 w-full"
          >
            Print ordering coming soon
          </button>
        </article>
      ))}
    </div>
  );
}
