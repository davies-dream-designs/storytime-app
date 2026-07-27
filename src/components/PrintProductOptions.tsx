import { getPrintProductQuotes } from "@/lib/print-books/printProducts";
import type { BookProject } from "@/types/printBook";
import PrintCheckoutButton from "@/components/PrintCheckoutButton";
import { getTranslations } from "next-intl/server";

function formatAud(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
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
  const quote = getPrintProductQuotes({
    pageCount: effectivePageCount,
  }).find((candidate) => candidate.key === "hardcover");

  if (!quote) {
    return null;
  }

  return (
    <article className="flex min-h-full flex-col rounded-2xl border border-night-100 bg-white p-5 shadow-sm">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-star-600">
          {quote.badge}
        </p>
        <h3 className="mt-1 font-display text-2xl font-bold text-night-800">
          Hardcover keepsake
        </h3>
      </div>
      <p className="mt-3 text-sm leading-6 text-night-500">
        {quote.format} with a casewrap cover. Printed to order and shipped in
        Australia.
      </p>
      <div className="mt-4 space-y-2 text-sm text-night-600">
        <div className="flex items-center justify-between gap-3 border-t border-night-100 pt-3">
          <span className="text-night-500">{t("estimatedPrice")}</span>
          <span className="font-bold text-night-800">
            {formatAud(quote.priceAud)} + shipping
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-night-100 pt-3">
          <span className="text-night-500">{t("printPages")}</span>
          <span className="text-right font-medium">
            {quote.pageCount}
            {quote.needsPadding
              ? ` (${quote.paddingPages} quiet pages added)`
              : ""}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-night-100 pt-3">
          <span className="text-night-500">{t("printProduction")}</span>
          <span className="text-right font-medium">
            {quote.productionDays}
          </span>
        </div>
      </div>
      {quote.unsupportedReason ? (
        <p className="mt-4 rounded-xl bg-star-50 px-3 py-2 text-sm font-bold text-night-700">
          {quote.unsupportedReason}
        </p>
      ) : null}
      {!orderingAvailable && quote.isWithinSpecs ? (
        <p className="mt-4 rounded-xl bg-moon-50 px-3 py-2 text-sm font-bold text-night-700">
          {t("printOrderingComingSoon")}
        </p>
      ) : null}
      <div className="mt-auto">
        <PrintCheckoutButton
          projectId={project.id}
          productKey={quote.key}
          priceAud={quote.priceAud}
          disabled={!quote.isWithinSpecs || !orderingAvailable}
          label={orderingAvailable ? "Order hardcover" : t("comingSoon")}
        />
      </div>
    </article>
  );
}
