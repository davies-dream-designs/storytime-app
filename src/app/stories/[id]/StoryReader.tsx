'use client'

import { useState } from 'react'
import type { Story } from '@/types'

export default function StoryReader({ story }: { story: Story }) {
  const [page, setPage] = useState(0)
  const currentPage = story.pages[page]
  const total = story.pages.length

  return (
    <div className="select-none">
      {/* Book */}
      <div className="relative rounded-3xl border border-night-100 bg-white shadow-xl overflow-hidden">
        {/* Page header */}
        <div className="border-b border-night-50 px-8 py-4 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-night-300">
            {story.title}
          </p>
        </div>

        {/* Illustration placeholder */}
        <div className="flex items-center justify-center bg-gradient-to-b from-night-50 to-parchment px-8 py-10">
          <div className="flex h-48 w-full max-w-xs flex-col items-center justify-center rounded-2xl border-2 border-dashed border-night-200 text-center sm:h-56">
            <div className="text-4xl" aria-hidden>🎨</div>
            <p className="mt-2 text-xs text-night-300 max-w-48">
              {currentPage?.illustrationPrompt}
            </p>
          </div>
        </div>

        {/* Story text */}
        <div className="px-8 pb-10 pt-6">
          <p className="font-display text-xl font-medium leading-relaxed text-night-800 sm:text-2xl">
            {currentPage?.text}
          </p>
        </div>

        {/* Page number */}
        <div className="border-t border-night-50 px-8 py-4 text-center">
          <p className="text-sm text-night-300">
            Page {page + 1} of {total}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="flex items-center gap-2 rounded-full border border-night-200 px-6 py-3 font-bold text-night-600 transition hover:bg-night-50 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ← Previous
        </button>

        {/* Dot navigation */}
        <div className="flex gap-1.5">
          {story.pages.map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              aria-label={`Go to page ${i + 1}`}
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
          Next →
        </button>
      </div>

      {/* Full story toggle */}
      <details className="mt-8 rounded-2xl border border-night-100 bg-white">
        <summary className="cursor-pointer px-6 py-4 font-bold text-night-600 hover:text-night-800">
          Read full story as text
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
