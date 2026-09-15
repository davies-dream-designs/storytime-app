import Image from "next/image";
import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import RefCapture from "@/components/RefCapture";

const primaryLink =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-moon-400 px-7 py-3.5 text-sm font-bold text-night-900 transition hover:bg-moon-300 hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-moon-400";
const heading =
  "font-display text-4xl font-bold leading-[1.08] tracking-[-0.02em] sm:text-5xl lg:text-6xl";
const eyebrow = "text-xs font-bold uppercase tracking-[0.18em]";

export default async function Home() {
  const { userId } = await auth();
  if (userId) {
    const locale = await getLocale();
    redirect(`/${locale}/dashboard`);
  }

  const t = await getTranslations("home");

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="overflow-x-clip bg-parchment text-night-800 selection:bg-moon-200"
    >
      <Suspense>
        <RefCapture />
      </Suspense>
      <header className="border-b border-night-100">
        <nav
          aria-label="Storycot"
          className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-5 sm:px-10"
        >
          <Link
            href="/"
            className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-night-800"
          >
            <Image
              src="/icon.svg"
              alt=""
              width={32}
              height={32}
              className="rounded-xl"
              aria-hidden
            />
            Storycot
          </Link>
          <div className="flex items-center gap-3 sm:gap-6">
            <a
              href="#story"
              className="hidden text-sm font-semibold text-night-600 underline-offset-4 hover:underline md:block"
            >
              {t("landing.preview")}
            </a>
            <LanguageSwitcher />
            <Link
              href="/dashboard"
              className="rounded-full border border-night-200 px-4 py-2.5 text-xs font-bold text-night-700 hover:bg-night-50 sm:px-6 sm:text-sm"
            >
              {t("openApp")}
            </Link>
          </div>
        </nav>
      </header>

      <section className="relative isolate bg-night-900 text-parchment">
        <div className="relative mx-auto grid max-w-[1600px] lg:min-h-[720px] lg:grid-cols-[0.92fr_1.08fr]">
          <div className="relative z-10 flex flex-col justify-center px-6 pb-10 pt-14 sm:px-12 sm:py-20 lg:py-24 lg:pl-16 xl:pl-24">
            <p className={`${eyebrow} mb-6 text-moon-300`}>
              {t("landing.eyebrow")}
            </p>
            <h1 className="max-w-xl text-balance font-display text-[clamp(3rem,5vw,5.25rem)] font-bold leading-[1.0] tracking-[-0.02em]">
              {t("hero")}
            </h1>
            <p className="mt-7 max-w-md text-base leading-relaxed text-night-200 sm:text-lg">
              {t("heroSub")}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link href="/dashboard" className={primaryLink}>
                {t("ctaCreate")}
              </Link>
              <a
                href="#story"
                className="py-3 text-sm font-semibold text-parchment underline decoration-moon-400/60 underline-offset-8 hover:decoration-moon-400"
              >
                {t("landing.preview")}
              </a>
            </div>
            <p className="mt-5 text-xs text-night-300">
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
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-night-900 via-transparent to-transparent lg:bg-gradient-to-r"
            />
            <p className="absolute bottom-5 right-5 max-w-64 rounded-sm bg-night-900/85 px-3 py-2 text-right text-[11px] leading-relaxed text-parchment">
              {t("landing.exampleLabel")}
            </p>
          </div>
        </div>
      </section>

      <section
        id="story"
        className="mx-auto grid max-w-6xl scroll-mt-8 items-center gap-10 px-6 py-20 sm:px-10 sm:py-28 md:grid-cols-2 md:gap-20"
      >
        <figure className="relative mx-auto w-full max-w-[390px]">
          <div
            aria-hidden
            className="absolute -inset-3 rotate-[-3deg] rounded-t-[160px] bg-moon-100"
          />
          <Image
            src="/landing/portrait.webp"
            alt={t("landing.portraitAlt")}
            width={1024}
            height={1536}
            sizes="(min-width: 768px) 390px, 85vw"
            className="relative aspect-[4/5] w-full rounded-t-[160px] object-cover object-center"
          />
          <figcaption className="relative mt-6 text-center font-display text-lg italic text-night-400">
            {t("landing.chapterOne")}
          </figcaption>
        </figure>
        <div>
          <p className={`${eyebrow} mb-5 text-star-600`}>
            {t("landing.chapterOne")}
          </p>
          <h2 className={`${heading} max-w-md text-balance text-night-800`}>
            {t("landing.introTitle")}
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-night-500">
            {t("landing.introBody")}
          </p>
          <Link
            href="/dashboard"
            className="mt-7 inline-block border-b border-night-800 pb-1 text-sm font-bold text-night-800 hover:text-star-600"
          >
            {t("ctaCreate")}
          </Link>
        </div>
      </section>

      <section className="bg-night-50 pb-16 pt-16 sm:pb-24 sm:pt-24">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 pb-10 sm:px-10 md:grid-cols-2 md:items-end md:gap-16">
          <div>
            <p className={`${eyebrow} mb-5 text-star-600`}>
              {t("landing.chapterTwo")}
            </p>
            <h2 className={`${heading} text-balance text-night-800`}>
              {t("landing.adventureTitle")}
            </h2>
          </div>
          <p className="max-w-md text-lg leading-relaxed text-night-500">
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
            className="aspect-[3/2] w-full rounded-sm object-cover sm:aspect-[16/9]"
          />
          <figcaption className="mx-auto mt-8 max-w-2xl px-4 text-center">
            <p className="font-display text-2xl italic leading-snug text-night-700 sm:text-3xl">
              &ldquo;{t("landing.excerpt")}&rdquo;
            </p>
            <p className="mt-4 text-xs text-night-400">
              {t("landing.exampleLabel")}
            </p>
          </figcaption>
        </figure>
      </section>

      <section className="mx-auto grid max-w-7xl items-center gap-10 px-6 py-20 sm:px-10 sm:py-28 md:grid-cols-[0.8fr_1.2fr] md:gap-16">
        <div>
          <p className={`${eyebrow} mb-5 text-star-600`}>
            {t("landing.chapterThree")}
          </p>
          <h2 className={`${heading} text-balance text-night-800`}>
            {t("landing.bedtimeTitle")}
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-night-500">
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

      <section className="border-y border-night-100 bg-moon-100 px-6 py-16 text-center sm:py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className={`${heading} text-balance text-night-800`}>
            {t("landing.keepsakeTitle")}
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-night-600">
            {t("landing.keepsakeBody")}
          </p>
          <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-night-500">
            {t("landing.pricing")}
          </p>
          <Link href="/dashboard" className={`${primaryLink} mt-8`}>
            {t("ctaCreate")}
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-20 text-center sm:px-10 sm:py-24">
        <p className={`${eyebrow} text-star-600`}>{t("landing.galleryEyebrow")}</p>
        <h2 className={`${heading} mx-auto mt-4 max-w-2xl text-balance text-night-800`}>
          {t("landing.galleryTitle")}
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-night-500">
          {t("landing.galleryBody")}
        </p>
        <Link
          href="/public"
          className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full border border-night-200 bg-parchment px-7 py-3.5 text-sm font-bold text-night-700 transition hover:border-night-300 hover:bg-night-50"
        >
          {t("ctaBrowse")}
        </Link>
      </section>

      <section className="bg-night-900 px-6 py-20 text-center text-parchment sm:py-28">
        <div className="mx-auto max-w-3xl">
          <p className={`${eyebrow} mb-6 text-moon-300`}>Storycot</p>
          <h2 className={`${heading} text-balance`}>
            {t("landing.finalTitle")}
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-night-200">
            {t("landing.finalBody")}
          </p>
          <Link href="/dashboard" className={`${primaryLink} mt-8`}>
            {t("ctaCreate")}
          </Link>
          <p className="mt-4 text-xs text-night-300">
            {t("landing.freeNote")}
          </p>
        </div>
      </section>

      <footer className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <Link
              href="/"
              className="font-display text-2xl font-bold tracking-tight text-night-800"
            >
              Storycot
            </Link>
            <p className="mt-2 max-w-sm text-sm text-night-500">
              {t("footerTagline")}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-night-600">
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
        <p className="mt-8 border-t border-night-100 pt-5 text-xs text-night-400">
          {t("landing.artNote")}
        </p>
      </footer>
    </main>
  );
}
