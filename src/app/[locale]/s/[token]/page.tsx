import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buttonClassName } from "@/components/ui/buttonStyles";
import { db } from "@/lib/db";

export default async function SharedStoryPage({
  params,
}: {
  params: Promise<{ token: string; locale: string }>;
}) {
  const { token, locale } = await params;
  const story = await db.stories.getByShareToken(token);
  if (!story) notFound();

  const t = await getTranslations("share");

  const dateLocale =
    locale === "zh"
      ? "zh-CN"
      : locale === "es"
        ? "es-ES"
        : locale === "fr"
          ? "fr-FR"
          : "en-AU";
  const dateStr = new Date(story.createdAt).toLocaleDateString(dateLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-night-50">
      {/* Header */}
      <div className="border-b border-night-100 bg-white px-5 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 font-display text-xl font-bold text-night-800"
          >
            <span>🌙</span> Storycot
          </Link>
          <Link
            href="/sign-up"
            className={buttonClassName({ size: "compact" })}
          >
            {t("createOwn")}
          </Link>
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-5 py-10">
        {/* Story header */}
        <div className="mb-8 rounded-3xl bg-night-800 p-8 text-center text-white">
          <div className="text-5xl" aria-hidden>
            🌙
          </div>
          <h1 className="mt-4 font-display text-3xl font-bold text-moon-200 sm:text-4xl">
            {story.title}
          </h1>
          <p className="mt-2 text-night-300">
            {t("createdFor")}{" "}
            <span className="font-bold text-moon-300">{story.profileName}</span>
          </p>
          <p className="mt-1 text-sm text-night-500">{dateStr}</p>
        </div>

        {/* Story pages */}
        <div className="space-y-6">
          {story.pages.map((page, i) => (
            <div
              key={i}
              className="rounded-2xl border border-night-100 bg-white p-6 shadow-sm"
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-night-100 text-xs font-bold text-night-500">
                  {page.pageNumber}
                </span>
              </div>
              <p className="font-display text-lg leading-relaxed text-night-800">
                {page.text}
              </p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 rounded-3xl bg-gradient-to-br from-star-100 to-moon-100 p-8 text-center">
          <div className="text-4xl" aria-hidden>
            ✨
          </div>
          <h2 className="mt-3 font-display text-2xl font-bold text-night-800">
            {t("ctaTitle")}
          </h2>
          <p className="mt-2 text-night-500">{t("ctaSub")}</p>
          <Link
            href="/sign-up"
            className={buttonClassName({ className: "mt-6 px-8" })}
          >
            {t("ctaButton")}
          </Link>
        </div>

        <p className="mt-8 text-center text-xs text-night-400">{t("footer")}</p>
      </main>
    </div>
  );
}
