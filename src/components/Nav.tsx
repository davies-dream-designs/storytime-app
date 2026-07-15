'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useAuth, SignInButton, UserButton } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import LanguageSwitcher from '@/components/LanguageSwitcher'

export default function Nav() {
  const { isSignedIn } = useAuth()
  const [open, setOpen] = useState(false)
  const t = useTranslations('nav')

  return (
    <header className="sticky top-0 z-30 border-b border-night-100 bg-parchment/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 pr-6">
        <Link href="/" className="flex items-center gap-2 font-display text-xl font-bold text-night-700" onClick={() => setOpen(false)}>
          <Image src="/icon-light.svg" alt="" width={32} height={32} className="rounded-lg" aria-hidden />
          Storycot
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-1">
          {isSignedIn ? (
            <>
              <Link href="/profiles" className="rounded-full px-4 py-2 text-sm font-bold text-night-600 transition hover:bg-night-100">{t('profiles')}</Link>
              <Link href="/stories" className="rounded-full px-4 py-2 text-sm font-bold text-night-600 transition hover:bg-night-100">{t('stories')}</Link>
              <Link href="/books" className="rounded-full px-4 py-2 text-sm font-bold text-night-600 transition hover:bg-night-100">{t('books')}</Link>
              <Link href="/stories/new" className="whitespace-nowrap rounded-full bg-night-700 px-4 py-2 text-sm font-bold text-moon-200 transition hover:bg-night-600">
                {t('newStory')}
              </Link>
              <Link href="/account" className="rounded-full px-3 py-2 text-sm font-bold text-night-500 transition hover:bg-night-100" title={t('accountCredits')}>
                ✨
              </Link>
              <LanguageSwitcher />
              <UserButton />
            </>
          ) : (
            <>
              <LanguageSwitcher />
              <SignInButton mode="modal">
                <button className="rounded-full bg-night-700 px-4 py-2 text-sm font-bold text-moon-200 transition hover:bg-night-600">
                  {t('signIn')}
                </button>
              </SignInButton>
            </>
          )}
        </div>

        {/* Mobile: avatar + hamburger */}
        <div className="flex sm:hidden items-center gap-3">
          <LanguageSwitcher />
          {isSignedIn ? (
            <>
              <UserButton />
              <button
                onClick={() => setOpen((o) => !o)}
                className="rounded-lg p-2 text-night-600 transition hover:bg-night-100"
                aria-label={open ? t('closeMenu') : t('openMenu')}
              >
                {open ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                )}
              </button>
            </>
          ) : (
            <SignInButton mode="modal">
              <button className="rounded-full bg-night-700 px-4 py-2 text-sm font-bold text-moon-200">
                {t('signIn')}
              </button>
            </SignInButton>
          )}
        </div>
      </nav>

      {/* Mobile drawer */}
      {open && isSignedIn && (
        <div className="sm:hidden border-t border-night-100 bg-parchment/95 backdrop-blur px-4 py-3 flex flex-col gap-1">
          <Link href="/dashboard" onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-sm font-bold text-night-700 hover:bg-night-50 transition">
            {t('dashboard')}
          </Link>
          <Link href="/profiles" onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-sm font-bold text-night-700 hover:bg-night-50 transition">
            {t('profilesMobile')}
          </Link>
          <Link href="/stories" onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-sm font-bold text-night-700 hover:bg-night-50 transition">
            {t('storiesMobile')}
          </Link>
          <Link href="/books" onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-sm font-bold text-night-700 hover:bg-night-50 transition">
            {t('booksMobile')}
          </Link>
          <Link href="/account" onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-sm font-bold text-night-700 hover:bg-night-50 transition">
            {t('accountMobile')}
          </Link>
          <Link
            href="/stories/new"
            onClick={() => setOpen(false)}
            className="mt-2 rounded-full bg-night-700 px-4 py-3 text-center text-sm font-bold text-moon-200 transition hover:bg-night-600"
          >
            {t('newStory')}
          </Link>
        </div>
      )}
    </header>
  )
}
