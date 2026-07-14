'use client'

import { Suspense, useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, Link } from '@/i18n/navigation'
import { useSearchParams } from 'next/navigation'
import { useLocale } from 'next-intl'
import Nav from '@/components/Nav'
import type { ChildProfile, StorySuggestion } from '@/types'

const THEME_EMOJIS: Record<string, string> = {
  kindness: '💛', bravery: '🦁', sharing: '🤝', 'trying new things': '🌈',
  'dealing with emotions': '💭', friendship: '👫', patience: '🌿',
  honesty: '✅', gratitude: '🙏', perseverance: '💪',
}

function GenerateForm() {
  const router = useRouter()
  const t = useTranslations('stories')
  const locale = useLocale()
  const searchParams = useSearchParams()
  const defaultProfileId = searchParams.get('profileId') ?? ''

  const [profiles, setProfiles] = useState<ChildProfile[]>([])
  const [profileId, setProfileId] = useState(defaultProfileId)
  const [loadingProfiles, setLoadingProfiles] = useState(true)
  const [suggestions, setSuggestions] = useState<StorySuggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState<StorySuggestion | null>(null)
  const [customMode, setCustomMode] = useState(false)
  const [customTheme, setCustomTheme] = useState('')
  const [notes, setNotes] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/profiles')
      .then((r) => r.json())
      .then((data: ChildProfile[]) => {
        setProfiles(data)
        if (!defaultProfileId && data.length > 0) setProfileId(data[0].id)
      })
      .finally(() => setLoadingProfiles(false))
  }, [defaultProfileId])

  async function fetchSuggestions(pid: string) {
    if (!pid) return
    setLoadingSuggestions(true)
    setSuggestions([])
    setSelectedSuggestion(null)
    setCustomMode(false)
    try {
      const res = await fetch('/api/stories/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: pid }),
      })
      const data = await res.json()
      if (res.ok) setSuggestions(data)
    } catch { /* ignore */ } finally {
      setLoadingSuggestions(false)
    }
  }

  function selectProfile(pid: string) {
    setProfileId(pid)
    setSuggestions([])
    setSelectedSuggestion(null)
    setCustomMode(false)
  }

  async function handleGenerate() {
    setError('')
    if (!profileId) { setError(t('errorNoProfile')); return }
    if (!selectedSuggestion && !customMode) { setError(t('errorNoIdea')); return }

    setGenerating(true)
    try {
      const body = selectedSuggestion
        ? { profileId, theme: selectedSuggestion.theme, premise: selectedSuggestion.premise, notes, locale }
        : { profileId, theme: customTheme || 'a gentle adventure', notes, locale }

      const res = await fetch('/api/stories/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      router.push(`/stories/${data.id}` as string)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setGenerating(false)
    }
  }

  const selectedProfile = profiles.find((p) => p.id === profileId)

  if (loadingProfiles) return <p className="text-night-400">{t('loadingProfiles')}</p>

  if (profiles.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-night-200 p-10 text-center">
        <p className="font-display font-bold text-night-600">{t('noProfiles')}</p>
        <p className="mt-1 text-sm text-night-400">{t('noProfilesSub')}</p>
        <Link href="/profiles/new" className="mt-4 inline-block rounded-full bg-night-700 px-5 py-2.5 text-sm font-bold text-moon-200">
          {t('createProfileButton')}
        </Link>
      </div>
    )
  }

  const showIdeas = suggestions.length > 0 || loadingSuggestions
  const readyToGenerate = profileId && (selectedSuggestion || customMode)

  return (
    <div className="space-y-8">
      <div>
        <p className="mb-3 text-sm font-bold uppercase tracking-wide text-night-400">{t('stepWho')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {profiles.map((p) => (
            <button key={p.id} type="button" onClick={() => selectProfile(p.id)}
              className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition ${profileId === p.id ? 'border-star-400 bg-star-50' : 'border-night-200 bg-white hover:border-night-300'}`}
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-star-300 to-moon-300 font-display font-bold text-night-800">
                {p.name[0].toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-night-800">{p.name}</p>
                <p className="text-xs text-night-400">{t('ageLabel', { age: p.age })}</p>
              </div>
            </button>
          ))}
        </div>

        {profileId && !showIdeas && (
          <button type="button" onClick={() => fetchSuggestions(profileId)}
            className="mt-4 w-full rounded-xl border-2 border-dashed border-night-300 py-3 text-sm font-bold text-night-600 transition hover:border-star-400 hover:text-star-600">
            {t('getIdeas', { name: selectedProfile?.name ?? '' })}
          </button>
        )}
      </div>

      {showIdeas && (
        <div>
          <p className="mb-3 text-sm font-bold uppercase tracking-wide text-night-400">{t('stepChoose')}</p>
          {loadingSuggestions ? (
            <div className="space-y-3">
              {[1,2,3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-night-100" />)}
              <p className="text-center text-sm text-night-400">{t('loadingSuggestions', { name: selectedProfile?.name ?? '' })}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {suggestions.map((s, i) => (
                <button key={i} type="button" onClick={() => { setSelectedSuggestion(s); setCustomMode(false) }}
                  className={`w-full rounded-2xl border-2 p-4 text-left transition ${selectedSuggestion === s ? 'border-star-400 bg-star-50' : 'border-night-200 bg-white hover:border-night-300'}`}>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-2xl">{THEME_EMOJIS[s.theme] ?? '🌙'}</span>
                    <div>
                      <p className="font-display font-bold text-night-800">{s.title}</p>
                      <p className="mt-1 text-sm text-night-500">{s.premise}</p>
                      <span className="mt-2 inline-block rounded-full bg-night-100 px-2.5 py-0.5 text-xs font-bold text-night-500">{s.theme}</span>
                    </div>
                  </div>
                </button>
              ))}

              <button type="button" onClick={() => { setCustomMode(true); setSelectedSuggestion(null) }}
                className={`w-full rounded-2xl border-2 p-4 text-left transition ${customMode ? 'border-star-400 bg-star-50' : 'border-night-200 bg-white hover:border-night-300'}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">✏️</span>
                  <p className="font-display font-bold text-night-800">{t('customOption')}</p>
                </div>
              </button>

              {customMode && (
                <div className="space-y-3 rounded-2xl border border-night-100 bg-white p-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-bold text-night-700">{t('themeLabel')}</label>
                    <input value={customTheme} onChange={(e) => setCustomTheme(e.target.value)} placeholder={t('themePlaceholder')}
                      className="w-full rounded-xl border border-night-200 px-4 py-2.5 text-sm outline-none focus:border-star-400 focus:ring-2 focus:ring-star-200" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {readyToGenerate && (
        <div>
          <label className="mb-1.5 block text-sm font-bold text-night-700">{t('notesLabel')}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            placeholder={t('notesPlaceholder', { name: selectedProfile?.name ?? '' })}
            className="w-full rounded-xl border border-night-200 px-4 py-2.5 text-sm outline-none focus:border-star-400 focus:ring-2 focus:ring-star-200" />
        </div>
      )}

      {error && <p className="rounded-xl bg-blush-100 px-4 py-3 text-sm font-bold text-blush-500">{error}</p>}

      {readyToGenerate && (
        <button type="button" onClick={handleGenerate} disabled={generating}
          className="w-full rounded-full bg-night-700 py-4 font-display text-lg font-bold text-moon-200 transition hover:bg-night-600 disabled:opacity-60">
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">✨</span> {t('generating')}
            </span>
          ) : t('generateButton2')}
        </button>
      )}

      {generating && <p className="text-center text-sm text-night-400">{t('generatingSub')}</p>}
    </div>
  )
}

export default function GenerateStoryPage() {
  const t = useTranslations('stories')
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-2xl px-5 py-10">
        <div className="mb-8">
          <h1 className="font-display text-4xl font-bold text-night-800">{t('newTitle')}</h1>
          <p className="mt-2 text-night-500">{t('newSub')}</p>
        </div>
        <Suspense fallback={<p className="text-night-400">{t('loadingProfiles')}</p>}>
          <GenerateForm />
        </Suspense>
      </main>
    </>
  )
}
