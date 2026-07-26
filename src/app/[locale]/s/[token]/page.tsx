import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buttonClassName } from "@/components/ui/buttonStyles";
import { getDateLocale } from "@/i18n/locales";
import { getSharedStoryByToken } from "@/lib/sharedStory";
import SharedNarrationButton from "./SharedNarrationButton";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string; locale: string }>;
}): Promise<Metadata> {
  const { token, locale } = await params;
  const shared = await getSharedStoryByToken(token);
  if (!shared) return {};

  const title = `${shared.story.title} — a Storycot story`;
  const description = `A personalised bedtime story created especially for ${shared.story.profileName}.`;
  const url = `/${locale}/s/${token}`;
  const imageUrl = `/${locale}/s/${token}/opengraph-image`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "Storycot",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: title }],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function SharedStoryPage({
  params,
}: {
  params: Promise<{ token: string; locale: string }>;
}) {
  const { token, locale } = await params;
  const shared = await getSharedStoryByToken(token);
  if (!shared) notFound();

  const t = await getTranslations("share");

  const { story } = shared;
  const dateStr = new Date(story.createdAt).toLocaleDateString(
    getDateLocale(locale),
    {
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  );
  const heroImageUrl =
    shared.coverImageUrl ??
    shared.spreads.find((spread) => spread.imageUrl)?.imageUrl;

  return (
    <div className="min-h-screen bg-night-50">
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
        <div className="mb-8 overflow-hidden rounded-3xl bg-night-800 text-white shadow-xl lg:grid lg:grid-cols-[1.05fr_0.95fr]">
          {heroImageUrl ? (
            <div className="relative aspect-square lg:aspect-auto">
              <Image
                src={heroImageUrl}
                alt=""
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
                priority
              />
            </div>
          ) : null}
          <div className="flex min-h-[320px] flex-col justify-center p-8 text-center lg:text-left">
            <div className="text-5xl" aria-hidden>
              🌙
            </div>
            <h1 className="mt-4 font-display text-3xl font-bold text-moon-200 sm:text-4xl">
              {story.title}
            </h1>
            <p className="mt-2 text-night-300">
              {t("createdFor")}{" "}
              <span className="font-bold text-moon-300">
                {story.profileName}
              </span>
            </p>
            <p className="mt-1 text-sm text-night-500">{dateStr}</p>
            {shared.narrationEnabled && shared.project ? (
              <SharedNarrationButton
                className="mt-6 self-center lg:self-start"
                projectId={shared.project.id}
                token={token}
                spreadIds={shared.spreads.map((spread) => spread.id)}
              />
            ) : null}
          </div>
        </div>

        <div className="space-y-6">
          {shared.spreads.map((spread, i) => (
            <div
              key={spread.id}
              className="overflow-hidden rounded-2xl border border-night-100 bg-white shadow-sm md:grid md:grid-cols-[minmax(220px,0.82fr)_1fr]"
            >
              {spread.imageUrl ? (
                <div className="relative aspect-square bg-moon-50">
                  <Image
                    src={spread.imageUrl}
                    alt=""
                    fill
                    sizes="(min-width: 768px) 34vw, 100vw"
                    className="object-cover"
                  />
                </div>
              ) : null}
              <div className="p-6">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-night-100 text-xs font-bold text-night-500">
                    {i + 1}
                  </span>
                  {spread.title ? (
                    <h2 className="font-display text-sm font-bold text-night-500">
                      {spread.title}
                    </h2>
                  ) : null}
                </div>
                <p className="font-display text-lg leading-relaxed text-night-800">
                  {spread.text}
                </p>
              </div>
            </div>
          ))}
        </div>

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
