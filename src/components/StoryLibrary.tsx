'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { Story, ChildProfile } from '@/types'

export default function StoryLibrary({ stories, profiles }: { stories: Story[]; profiles: ChildProfile[] }) {
  const [query, setQuery] = useState('')
  const [profileFilter, setProfileFilter] = useState('')

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    return stories.filter((s) => {
      const matchesProfile = !profileFilter || s.profileName === profileFilter
      const matchesQuery = !q || s.title.toLowerCase().includes(q) || s.theme.toLowerCase().includes(q) || s.profileName.toLowerCase().includes(q)
      return matchesProfile && matchesQuery
    })
  }, [stories, query, profileFilter])

  if (stories.length === 0) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-night-200 p-16 text-center">
        <div className="text-5xl" aria-hidden>📚</div>
        <h2 className="mt-4 font-display text-2xl font-bold text-night-700">Your library is empty</h2>
        <p className="mt-2 text-night-400">
          {profiles.length === 0 ? 'First, create a child profile. Then generate your first story!' : 'Generate your first personalised bedtime story.'}
        </p>
        <Link
          href={profiles.length === 0 ? '/profiles/new' : '/stories/new'}
          className="mt-6 inline-block rounded-full bg-night-700 px-6 py-3 font-bold text-moon-200 transition hover:bg-night-600"
        >
          {profiles.length === 0 ? 'Create a profile' : 'Generate a story'}
        </Link>
      </div>
    )
  }

  return (
    <>
      {/* Search + filter bar */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-night-300" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            placeholder="Search stories, themes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-full border border-night-100 bg-white py-2.5 pl-10 pr-4 text-sm text-night-700 placeholder:text-night-300 focus:outline-none focus:ring-2 focus:ring-night-300"
          />
        </div>
        {profiles.length > 1 && (
          <select
            value={profileFilter}
            onChange={(e) => setProfileFilter(e.target.value)}
            className="rounded-full border border-night-100 bg-white px-4 py-2.5 text-sm font-bold text-night-600 focus:outline-none focus:ring-2 focus:ring-night-300"
          >
            <option value="">All children</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-night-100 bg-white p-12 text-center">
          <div className="text-4xl" aria-hidden>🔍</div>
          <p className="mt-4 font-bold text-night-600">No stories match your search.</p>
          <button onClick={() => { setQuery(''); setProfileFilter('') }} className="mt-3 text-sm text-night-400 underline">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((story) => (
            <Link
              key={story.id}
              href={`/stories/${story.id}`}
              className="group flex flex-col rounded-2xl border border-night-100 bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <div className="mb-4 flex items-start justify-between gap-2">
                <span className="text-3xl" aria-hidden>📖</span>
                <span className="rounded-full bg-moon-100 px-3 py-1 text-xs font-bold text-night-700 capitalize">{story.theme}</span>
              </div>
              <h3 className="font-display text-lg font-bold text-night-800 group-hover:text-night-600 line-clamp-2">{story.title}</h3>
              <p className="mt-2 text-sm text-night-400">For {story.profileName}</p>
              <div className="mt-3 flex items-center gap-3 text-xs text-night-300">
                <span>{story.wordCount} words</span>
                <span>·</span>
                <span>{story.pages.length} pages</span>
                <span>·</span>
                <span>{new Date(story.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
              </div>
              <div className="mt-4">
                <span className="block rounded-xl bg-night-700 py-2 text-center text-xs font-bold text-moon-200 transition group-hover:bg-night-600">
                  Read →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {filtered.length > 0 && filtered.length < stories.length && (
        <p className="mt-4 text-center text-sm text-night-400">
          Showing {filtered.length} of {stories.length} stories
        </p>
      )}
    </>
  )
}
