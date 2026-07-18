import Image from 'next/image'
import { Suspense } from 'react'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import RefCapture from '@/components/RefCapture'
import { getLocale } from 'next-intl/server'

export default async function Home() {
  const { userId } = await auth()
  if (userId) {
    const locale = await getLocale()
    redirect(`/${locale}/dashboard`)
  }

  const t = await getTranslations('home')

  const features = [
    { icon: '👶', title: t('feature1Title'), body: t('feature1Desc') },
    { icon: '✨', title: t('feature2Title'), body: t('feature2Desc') },
    { icon: '📚', title: t('feature3Title'), body: t('feature3Desc') },
    { icon: '🖨️', title: t('feature4Title'), body: t('feature4Desc') },
  ]

  const arcSteps = [
    { num: '1', label: t('arc.introduction'), icon: '🌅' },
    { num: '2', label: t('arc.adventure'), icon: '🗺️' },
    { num: '3', label: t('arc.growth'), icon: '🌱' },
    { num: '4', label: t('arc.resolution'), icon: '⭐' },
    { num: '5', label: t('arc.bedtime'), icon: '😴' },
  ]

  const themes = [
    ['💛', t('themes.kindness')],
    ['🦁', t('themes.bravery')],
    ['🤝', t('themes.sharing')],
    ['🌈', t('themes.tryingNewThings')],
    ['💭', t('themes.dealingWithEmotions')],
    ['👫', t('themes.friendship')],
    ['🌿', t('themes.patience')],
    ['✅', t('themes.honesty')],
    ['🙏', t('themes.gratitude')],
    ['💪', t('themes.perseverance')],
  ]

  return (
    <main className="overflow-x-hidden">
      <Suspense><RefCapture /></Suspense>
      {/* Nav */}
      <header className="absolute inset-x-0 top-0 z-30">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link href="/" className="flex items-center gap-2 font-display text-2xl font-bold text-white">
            <Image src="/icon-dark.svg" alt="" width={36} height={36} className="rounded-xl" aria-hidden />
            Storycot
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="dark" />
            <Link
              href="/dashboard"
              className="rounded-full bg-moon-400 px-5 py-2.5 text-sm font-bold text-night-900 transition hover:bg-moon-300"
            >
              {t('openApp')}
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative min-h-screen bg-gradient-to-b from-night-900 via-night-800 to-night-700 flex items-center">
        {/* Stars */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {[
            [15, 12], [35, 8], [55, 18], [72, 5], [88, 14],
            [8, 35], [25, 42], [45, 30], [65, 45], [82, 38],
            [18, 62], [40, 55], [60, 68], [78, 58], [92, 72],
          ].map(([x, y], i) => (
            <div
              key={i}
              className="animate-twinkle absolute h-1 w-1 rounded-full bg-moon-200"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                animationDelay: `${i * 0.3}s`,
                opacity: 0.6 + (i % 3) * 0.15,
              }}
            />
          ))}
        </div>

        {/* Moon */}
        <div className="pointer-events-none absolute right-10 top-16 h-24 w-24 rounded-full bg-moon-200 opacity-20 blur-xl" aria-hidden />
        <div className="pointer-events-none absolute right-12 top-18 h-20 w-20 rounded-full bg-moon-300 opacity-30" aria-hidden />

        <div className="relative mx-auto max-w-5xl px-5 py-32 text-center">
          <div className="animate-drift mb-6 flex justify-center" aria-hidden>
            <Image src="/icon-dark.svg" alt="" width={120} height={120} className="rounded-3xl shadow-2xl shadow-night-900/50" />
          </div>
          <h1 className="font-display text-5xl font-bold leading-tight text-white sm:text-6xl lg:text-7xl">
            {t('hero')}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-night-200 sm:text-xl">
            {t('heroSub')}
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/dashboard"
              className="rounded-full bg-moon-400 px-8 py-4 text-lg font-bold text-night-900 transition hover:bg-moon-300 hover:scale-105"
            >
              {t('ctaCreate')}
            </Link>
            <Link
              href="/stories"
              className="rounded-full border border-white/20 px-8 py-4 text-lg font-bold text-white transition hover:bg-white/10"
            >
              {t('ctaBrowse')}
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <div className="text-center">
          <h2 className="font-display text-4xl font-bold text-night-800">
            {t('featureTitle')}
          </h2>
          <p className="mt-4 text-lg text-night-500">
            {t('featureSub')}
          </p>
        </div>
        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-3xl border border-night-100 bg-white p-8 shadow-sm"
            >
              <div className="text-4xl">{f.icon}</div>
              <h3 className="mt-4 font-display text-xl font-bold text-night-700">{f.title}</h3>
              <p className="mt-2 text-night-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Story arc */}
      <section className="bg-night-800 py-24 text-white">
        <div className="mx-auto max-w-4xl px-5 text-center">
          <h2 className="font-display text-4xl font-bold">{t('arcTitle')}</h2>
          <p className="mt-4 text-night-200">{t('arcSub')}</p>
          <div className="mt-14 grid grid-cols-5 gap-2 sm:gap-4">
            {arcSteps.map((step) => (
              <div key={step.num} className="flex flex-col items-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-moon-400/20 text-2xl">
                  {step.icon}
                </div>
                <p className="text-xs font-bold text-moon-300 sm:text-sm">{step.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Themes */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <div className="text-center">
          <h2 className="font-display text-4xl font-bold text-night-800">
            {t('themesTitle')}
          </h2>
          <p className="mt-4 text-lg text-night-500">
            {t('themesSub')}
          </p>
        </div>
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          {themes.map(([icon, theme]) => (
            <span
              key={theme}
              className="flex items-center gap-2 rounded-full border border-night-100 bg-white px-5 py-2.5 text-sm font-bold text-night-600 shadow-sm"
            >
              <span>{icon}</span> {theme}
            </span>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-b from-night-700 to-night-900 py-24 text-center">
        <div className="mx-auto max-w-2xl px-5">
          <div className="flex justify-center" aria-hidden>
            <Image src="/icon-dark.svg" alt="" width={80} height={80} className="rounded-2xl" />
          </div>
          <h2 className="mt-4 font-display text-4xl font-bold text-white">
            {t('ctaTitle')}
          </h2>
          <p className="mt-4 text-night-200">
            {t('ctaSub')}
          </p>
          <Link
            href="/dashboard"
            className="mt-8 inline-block rounded-full bg-moon-400 px-8 py-4 text-lg font-bold text-night-900 transition hover:bg-moon-300"
          >
            {t('ctaButton')}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-night-900 py-8 text-center text-night-300">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Image src="/icon-dark.svg" alt="" width={24} height={24} className="rounded-md" aria-hidden />
          <p className="font-display text-lg font-bold text-white">Storycot</p>
        </div>
        <p className="text-sm">{t('footerTagline')}</p>
      </footer>
    </main>
  )
}
