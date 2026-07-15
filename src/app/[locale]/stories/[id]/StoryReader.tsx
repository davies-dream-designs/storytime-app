'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Story } from '@/types'

export default function StoryReader({ story }: { story: Story }) {
  const [page, setPage] = useState(0)
  const t = useTranslations('stories')
  const currentPage = story.pages[page]
  const total = story.pages.length

  return (
    <div className="select-none">
      <div className="relative rounded-3xl border border-night-100 bg-white shadow-xl overflow-hidden">
        <div className="border-b border-night-50 px-8 py-4 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-night-300">
            {story.title}
          </p>
        </div>

        <div className="px-8 pb-10 pt-8">
          <p className="font-display text-xl font-medium leading-relaxed text-night-800 sm:text-2xl">
            {currentPage?.text}
          </p>
        </div>

        <div className="border-t border-night-50 px-8 py-4 text-center">
          <p className="text-sm text-night-300">
            {t('pageOf', { page: page + 1, total })}
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="flex items-center gap-2 rounded-full border border-night-200 px-6 py-3 font-bold text-night-600 transition hover:bg-night-50 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {t('prevButton')}
        </button>

        <div className="flex gap-1.5">
          {story.pages.map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              aria-label={t('goToPage', { page: i + 1 })}
              className={`h-2 rounded-full transition-all ${
                i === page ? 'w-6 bg-night-700' : 'w-2 bg-night-200 hover:bg-night-400'
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => setPage((p) => Math.min(total - 1, p + 1))}
          disabled={page === total - 1}
          className="flex items-center gap-2 rounded-full border border-night-200 px-6 py-3 font-bold text-night-600 transition hover:bg-night-50 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {t('nextButton')}
        </button>
      </div>

      <details className="mt-8 rounded-2xl border border-night-100 bg-white">
        <summary className="cursor-pointer px-6 py-4 font-bold text-night-600 hover:text-night-800">
          {t('readFullText')}
        </summary>
        <div className="border-t border-night-50 px-6 pb-6 pt-4">
          <div className="space-y-4 font-display text-lg leading-relaxed text-night-800">
            {story.pages.map((p, i) => (
              <p key={i}>{p.text}</p>
            ))}
          </div>
        </div>
      </details>
    </div>
  )
}
