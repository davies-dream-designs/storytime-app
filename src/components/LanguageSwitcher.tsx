'use client'

import { useTranslations, useLocale } from 'next-intl'
import { useRouter, usePathname } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

const LOCALE_LABELS: Record<string, string> = {
  en: 'EN',
  es: 'ES',
  fr: 'FR',
  zh: '中文',
}

export default function LanguageSwitcher({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const t = useTranslations('nav')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  const className = variant === 'dark'
    ? 'rounded-full border border-white/30 bg-white/10 px-2 py-1 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-white/40'
    : 'rounded-full border border-night-200 bg-parchment px-2 py-1 text-xs font-bold text-night-600 focus:outline-none focus:ring-2 focus:ring-night-300'

  return (
    <select
      value={locale}
      onChange={(e) => router.replace(pathname, { locale: e.target.value })}
      className={className}
      aria-label={t('language')}
    >
      {routing.locales.map((l) => (
        <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
      ))}
    </select>
  )
}
