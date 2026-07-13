'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Nav from '@/components/Nav'
import { LESSON_OPTIONS } from '@/types'
import type { ChildProfile } from '@/types'

function GenerateForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultProfileId = searchParams.get('profileId') ?? ''

  const [profiles, setProfiles] = useState<ChildProfile[]>([])
  const [profileId, setProfileId] = useState(defaultProfileId)
  const [theme, setTheme] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [loadingProfiles, setLoadingProfiles] = useState(true)

  useEffect(() => {
    fetch('/api/profiles')
      .then((r) => r.json())
      .then((data: ChildProfile[]) => {
        setProfiles(data)
        if (!defaultProfileId && data.length > 0) setProfileId(data[0].id)
      })
      .finally(() => setLoadingProfiles(false))
  }, [defaultProfileId])

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!profileId) { setError('Please select a child profile'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/stories/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, theme: theme || 'a gentle adventure', notes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      router.push(`/stories/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  const selectedProfile = profiles.find((p) => p.id === profileId)

  if (loadingProfiles) return <p className="text-night-400">Loading profiles…</p>

  if (profiles.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-night-200 p-10 text-center">
        <p className="font-display font-bold text-night-600">No profiles yet</p>
        <p className="mt-1 text-sm text-night-400">Create a child profile first.</p>
        <Link
          href="/profiles/new"
          className="mt-4 inline-block rounded-full bg-night-700 px-5 py-2.5 text-sm font-bold text-moon-200"
        >
          Create a profile
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleGenerate} className="space-y-6">
      {/* Profile selector */}
      <div>
        <p className="mb-2 text-sm font-bold text-night-700">For who?</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProfileId(p.id)}
              className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition ${
                profileId === p.id
                  ? 'border-star-400 bg-star-50'
                  : 'border-night-200 bg-white hover:border-night-300'
              }`}
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-star-300 to-moon-300 font-display font-bold text-night-800">
                {p.name[0].toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-night-800">{p.name}</p>
                <p className="text-xs text-night-400">Age {p.age}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Theme */}
      <div>
        <p className="mb-2 text-sm font-bold text-night-700">Story theme (optional)</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTheme('')}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
              theme === '' ? 'bg-night-700 text-moon-200' : 'border border-night-200 bg-white text-night-600 hover:border-night-400'
            }`}
          >
            ✨ Surprise me
          </button>
          {LESSON_OPTIONS.map((lesson) => (
            <button
              key={lesson}
              type="button"
              onClick={() => setTheme(lesson)}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                theme === lesson
                  ? 'bg-night-700 text-moon-200'
                  : 'border border-night-200 bg-white text-night-600 hover:border-night-400'
              }`}
            >
              {lesson}
            </button>
          ))}
        </div>
      </div>

      {/* Extra notes */}
      <div>
        <label className="mb-1.5 block text-sm font-bold text-night-700" htmlFor="notes">
          Extra ideas (optional)
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder={
            selectedProfile
              ? `e.g. Include ${selectedProfile.name}'s trip to the beach this week…`
              : 'e.g. Include a specific adventure or special detail…'
          }
          className="w-full rounded-xl border border-night-200 px-4 py-3 text-sm outline-none focus:border-star-400 focus:ring-2 focus:ring-star-200"
        />
      </div>

      {error && (
        <div className="rounded-xl bg-blush-100 px-4 py-3 text-sm font-bold text-blush-500">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-night-700 py-4 font-display text-lg font-bold text-moon-200 transition hover:bg-night-600 disabled:opacity-60"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin">✨</span>
            Writing the story…
          </span>
        ) : (
          '✨ Generate story'
        )}
      </button>

      {loading && (
        <p className="text-center text-sm text-night-400">
          Claude is weaving a magical story — this takes about 10–20 seconds.
        </p>
      )}
    </form>
  )
}

export default function GenerateStoryPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-2xl px-5 py-10">
        <div className="mb-8">
          <h1 className="font-display text-4xl font-bold text-night-800">Generate a story</h1>
          <p className="mt-2 text-night-500">
            Pick a child and a theme — a magical story will be ready in seconds.
          </p>
        </div>
        <Suspense fallback={<p className="text-night-400">Loading…</p>}>
          <GenerateForm />
        </Suspense>
      </main>
    </>
  )
}
