import Image from "next/image";
import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import RefCapture from "@/components/RefCapture";
import { db } from "@/lib/db";

const primaryLink =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-[#f0c88e] px-7 py-3.5 text-sm font-bold text-[#193d38] transition hover:bg-[#ffdfaf] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current";
const heading =
  "font-serif text-4xl leading-[1.08] tracking-[-0.035em] sm:text-5xl lg:text-6xl";
const eyebrow = "text-xs font-bold uppercase tracking-[0.18em]";

export default async function Home() {
  const { userId } = await auth();
  if (userId) {
    const locale = await getLocale();
    redirect(`/${locale}/dashboard`);
  }

  const t = await getTranslations("home");
  let showcaseStories: Array<{
    id: string;
    title: string;
    thumbnailUrl: string;
  }> = [];
  try {
    const stories = await db.stories.getPublicGallery(12);
    const thumbnails = await db.bookProjects.getPublicThumbnailsByStoryIds(
      stories.map((story) => story.id)
    );
    showcaseStories = stories
      .filter((story) => thumbnails[story.id])
      .slice(0, 3)
      .map((story) => ({
        id: story.id,
        title: story.title,
        thumbnailUrl: thumbnails[story.id]!,
      }));
  } catch {
    // The public landing page remains available during a gallery outage.
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="overflow-x-clip bg-[#faf6ed] text-[#193d38] selection:bg-[#f0c88e]"
    >
      <Suspense>
        <RefCapture />
      </Suspense>
      <header className="border-b border-[#193d38]/10">
        <nav
          aria-label="Storycot"
          className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-5 sm:px-10"
        >
          <Link
            href="/"
            className="font-serif text-3xl font-bold tracking-tight"
          >
            storycot<span className="text-[#a65335]">.</span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-6">
            <a
              href="#story"
              className="hidden text-sm font-semibold underline-offset-4 hover:underline md:block"
            >
              {t("landing.preview")}
            </a>
            <LanguageSwitcher />
            <Link
              href="/dashboard"
              className="rounded-full border border-[#193d38]/30 px-4 py-2.5 text-xs font-bold hover:bg-[#193d38]/5 sm:px-6 sm:text-sm"
            >
              {t("openApp")}
            </Link>
          </div>
        </nav>
      </header>

      <section className="relative isolate bg-[#153c37] text-[#faf6ed]">
        <div className="relative mx-auto grid max-w-[1600px] lg:min-h-[720px] lg:grid-cols-[0.92fr_1.08fr]">
          <div className="relative z-10 flex flex-col justify-center px-6 pb-10 pt-14 sm:px-12 sm:py-20 lg:py-24 lg:pl-16 xl:pl-24">
            <p className={`${eyebrow} mb-6 text-[#f0c88e]`}>
              {t("landing.eyebrow")}
            </p>
            <h1 className="max-w-xl text-balance font-serif text-[clamp(3.1rem,5.2vw,5.5rem)] leading-[0.99] tracking-[-0.045em]">
              {t("hero")}
            </h1>
            <p className="mt-7 max-w-md text-base leading-relaxed text-[#e0e8dc] sm:text-lg">
              {t("heroSub")}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link href="/dashboard" className={primaryLink}>
                {t("ctaCreate")}
              </Link>
              <a
                href="#story"
                className="py-3 text-sm font-semibold underline decoration-[#f0c88e]/60 underline-offset-8 hover:decoration-[#f0c88e]"
              >
                {t("landing.preview")}
              </a>
            </div>
            <p className="mt-5 text-xs text-[#cad7cf]">
              {t("landing.freeNote")}
            </p>
          </div>
          <div className="relative min-h-[330px] sm:min-h-[480px] lg:min-h-full">
            <Image
              src="/landing/woodland.webp"
              alt={t("landing.heroAlt")}
              fill
              priority
              sizes="(min-width: 1024px) 55vw, 100vw"
              className="object-cover object-[65%_center]"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#153c37] via-transparent to-transparent lg:bg-gradient-to-r"
            />
            <p className="absolute bottom-5 right-5 max-w-64 rounded-sm bg-[#153c37]/85 px-3 py-2 text-right text-[11px] leading-relaxed text-white">
              {t("landing.exampleLabel")}
            </p>
          </div>
        </div>
      </section>

      <section
        id="story"
        className="scroll-mt-8 mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 sm:px-10 sm:py-28 md:grid-cols-2 md:gap-20"
      >
        <figure className="relative mx-auto w-full max-w-[390px]">
          <div
            aria-hidden
            className="absolute -inset-3 rotate-[-3deg] rounded-t-[160px] bg-[#e9ddc8]"
          />
          <Image
            src="/landing/portrait.webp"
            alt={t("landing.portraitAlt")}
            width={1024}
            height={1536}
            sizes="(min-width: 768px) 390px, 85vw"
            className="relative aspect-[4/5] w-full rounded-t-[160px] object-cover object-center"
          />
          <figcaption className="relative mt-6 text-center font-serif text-lg italic text-[#695f4e]">
            {t("landing.chapterOne")}
          </figcaption>
        </figure>
        <div>
          <p className={`${eyebrow} mb-5 text-[#a65335]`}>
            {t("landing.chapterOne")}
          </p>
          <h2 className={`${heading} max-w-md text-balance`}>
            {t("landing.introTitle")}
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-[#56655b]">
            {t("landing.introBody")}
          </p>
          <Link
            href="/dashboard"
            className="mt-7 inline-block border-b border-[#193d38] pb-1 text-sm font-bold hover:text-[#a65335]"
          >
            {t("ctaCreate")}
          </Link>
        </div>
      </section>

      <section className="bg-[#e9eee5] pb-16 pt-16 sm:pb-24 sm:pt-24">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 pb-10 sm:px-10 md:grid-cols-2 md:items-end md:gap-16">
          <div>
            <p className={`${eyebrow} mb-5 text-[#73523d]`}>
              {t("landing.chapterTwo")}
            </p>
            <h2 className={`${heading} text-balance`}>
              {t("landing.adventureTitle")}
            </h2>
          </div>
          <p className="max-w-md text-lg leading-relaxed text-[#56655b]">
            {t("landing.adventureBody")}
          </p>
        </div>
        <figure className="mx-auto max-w-[1360px] px-3 sm:px-10">
          <Image
            src="/landing/adventure.webp"
            alt={t("landing.adventureAlt")}
            width={1536}
            height={1024}
            sizes="(min-width: 1360px) 1280px, 100vw"
            className="aspect-[3/2] w-full rounded-[3px] object-cover sm:aspect-[16/9]"
          />
          <figcaption className="mx-auto mt-8 max-w-2xl px-4 text-center">
            <p className="font-serif text-2xl italic leading-snug sm:text-3xl">
              “{t("landing.excerpt")}”
            </p>
            <p className="mt-4 text-xs text-[#56655b]">
              {t("landing.exampleLabel")}
            </p>
          </figcaption>
        </figure>
      </section>

      <section className="mx-auto grid max-w-7xl items-center gap-10 px-6 py-20 sm:px-10 sm:py-28 md:grid-cols-[0.8fr_1.2fr] md:gap-16">
        <div>
          <p className={`${eyebrow} mb-5 text-[#a65335]`}>
            {t("landing.chapterThree")}
          </p>
          <h2 className={`${heading} text-balance`}>
            {t("landing.bedtimeTitle")}
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-[#56655b]">
            {t("landing.bedtimeBody")}
          </p>
        </div>
        <Image
          src="/landing/bedtime.webp"
          alt={t("landing.bedtimeAlt")}
          width={1536}
          height={1024}
          sizes="(min-width: 768px) 55vw, 100vw"
          className="aspect-[6/5] w-full rounded-t-[100px] object-cover sm:rounded-t-[180px]"
        />
      </section>

      <section className="border-y border-[#193d38]/15 bg-[#f1e9da] px-6 py-16 text-center sm:py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className={`${heading} text-balance`}>
            {t("landing.keepsakeTitle")}
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[#56655b]">
            {t("landing.keepsakeBody")}
          </p>
          <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-[#56655b]">
            {t("landing.pricing")}
          </p>
          <Link
            href="/dashboard"
            className={`${primaryLink} mt-8 border border-[#193d38]/20`}
          >
            {t("ctaCreate")}
          </Link>
        </div>
      </section>

      {showcaseStories.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-20 sm:px-10 sm:py-24">
          <p className={`${eyebrow} text-[#a65335]`}>
            {t("landing.galleryEyebrow")}
          </p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
            <h2 className={`${heading} max-w-2xl text-balance`}>
              {t("landing.galleryTitle")}
            </h2>
            <Link
              href="/public"
              className="border-b border-current pb-1 text-sm font-bold"
            >
              {t("ctaBrowse")}
            </Link>
          </div>
          <p className="mt-5 text-[#56655b]">{t("landing.galleryBody")}</p>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {showcaseStories.map((story) => (
              <Link key={story.id} href="/public" className="group">
                <Image
                  src={story.thumbnailUrl}
                  alt={story.title}
                  width={400}
                  height={400}
                  sizes="(min-width: 640px) 30vw, 90vw"
                  className="aspect-square w-full rounded-sm object-cover transition duration-300 motion-safe:group-hover:-translate-y-1"
                />
                <h3 className="mt-4 font-serif text-2xl group-hover:underline">
                  {story.title}
                </h3>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="bg-[#153c37] px-6 py-20 text-center text-[#faf6ed] sm:py-28">
        <div className="mx-auto max-w-3xl">
          <p className={`${eyebrow} mb-6 text-[#f0c88e]`}>Storycot</p>
          <h2 className={`${heading} text-balance`}>
            {t("landing.finalTitle")}
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-[#e0e8dc]">
            {t("landing.finalBody")}
          </p>
          <Link href="/dashboard" className={`${primaryLink} mt-8`}>
            {t("ctaCreate")}
          </Link>
          <p className="mt-4 text-xs text-[#cad7cf]">{t("landing.freeNote")}</p>
        </div>
      </section>

      <footer className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <Link
              href="/"
              className="font-serif text-3xl font-bold tracking-tight"
            >
              storycot.
            </Link>
            <p className="mt-2 max-w-sm text-sm text-[#56655b]">
              {t("footerTagline")}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold">
            <Link href="/support" className="hover:underline">
              {t("landing.help")}
            </Link>
            <Link href="/privacy" className="hover:underline">
              {t("landing.privacy")}
            </Link>
            <Link href="/terms" className="hover:underline">
              {t("landing.terms")}
            </Link>
          </div>
        </div>
        <p className="mt-8 border-t border-[#193d38]/10 pt-5 text-xs text-[#56655b]">
          {t("landing.artNote")}
        </p>
      </footer>
    </main>
  );
}
