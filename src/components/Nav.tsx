'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useAuth, SignInButton, UserButton } from '@clerk/nextjs'

export default function Nav() {
  const { isSignedIn } = useAuth()

  return (
    <header className="sticky top-0 z-30 border-b border-night-100 bg-parchment/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2 font-display text-xl font-bold text-night-700">
          <Image src="/nav-icon-light.png" alt="" width={32} height={32} className="rounded-lg" aria-hidden />
          Storycot
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          {isSignedIn ? (
            <>
              <Link
                href="/profiles"
                className="rounded-full px-4 py-2 text-sm font-bold text-night-600 transition hover:bg-night-50"
              >
                Profiles
              </Link>
              <Link
                href="/stories"
                className="rounded-full px-4 py-2 text-sm font-bold text-night-600 transition hover:bg-night-50"
              >
                Stories
              </Link>
              <Link
                href="/stories/new"
                className="whitespace-nowrap rounded-full bg-night-700 px-4 py-2 text-sm font-bold text-moon-200 transition hover:bg-night-600"
              >
                + New story
              </Link>
              <Link
                href="/account"
                className="rounded-full px-3 py-2 text-sm font-bold text-night-500 transition hover:bg-night-50"
                title="Credits"
              >
                ✨
              </Link>
              <UserButton />
            </>
          ) : (
            <SignInButton mode="modal">
              <button className="rounded-full bg-night-700 px-4 py-2 text-sm font-bold text-moon-200 transition hover:bg-night-600">
                Sign in
              </button>
            </SignInButton>
          )}
        </div>
      </nav>
    </header>
  )
}
