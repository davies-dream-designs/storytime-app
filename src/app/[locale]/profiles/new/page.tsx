'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import Nav from '@/components/Nav'
import { LESSON_OPTIONS } from '@/types'

type TagsFieldProps = {
  label: string
  values: string[]
  onChange: (vals: string[]) => void
  placeholder: string
}

function TagsField({ label, values, onChange, placeholder }: TagsFieldProps) {
  const [input, setInput] = useState('')

  function add() {
    const trimmed = input.trim()
    if (trimmed && !values.includes(trimmed)) onChange([...values, trimmed])
    setInput('')
  }

  function remove(val: string) {
    onChange(values.filter((v) => v !== val))
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-bold text-night-700">{label}</label>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-night-200 px-4 py-2.5 text-sm outline-none focus:border-star-400 focus:ring-2 focus:ring-star-200"
        />
        <button type="button" onClick={add} className="rounded-xl bg-night-100 px-4 py-2.5 text-sm font-bold text-night-600 hover:bg-night-200">
          Add
        </button>
      </div>
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((v) => (
            <span key={v} className="flex items-center gap-1.5 rounded-full bg-star-100 px-3 py-1 text-sm font-bold text-star-700">
              {v}
              <button type="button" onClick={() => remove(v)} className="text-star-400 hover:text-star-700" aria-label={`Remove ${v}`}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 15 }, (_, i) => currentYear - i)
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

export default function NewProfilePage() {
  const router = useRouter()
  const t = useTranslations('profiles')
  const [name, setName] = useState('')
  const [dobDay, setDobDay] = useState('')
  const [dobMonth, setDobMonth] = useState('')
  const [dobYear, setDobYear] = useState('')
  const [favouriteCharacters, setFavouriteCharacters] = useState<string[]>([])
  const [favouriteActivities, setFavouriteActivities] = useState<string[]>([])
  const [favouriteAnimals, setFavouriteAnimals] = useState<string[]>([])
  const [favouritePlaces, setFavouritePlaces] = useState<string[]>([])
  const [lessons, setLessons] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const MONTH_KEYS = ['months.1','months.2','months.3','months.4','months.5','months.6','months.7','months.8','months.9','months.10','months.11','months.12'] as const
  const MONTHS = MONTH_KEYS.map((key, i) => ({ value: i + 1, label: t(key) }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError(t('errorName')); return }
    if (!dobYear) { setError(t('errorYear')); return }

    const year = parseInt(dobYear, 10)
    const month = dobMonth ? parseInt(dobMonth, 10) : null
    const day = dobDay ? parseInt(dobDay, 10) : null

    const dateOfBirth = month && day
      ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      : month ? `${year}-${String(month).padStart(2, '0')}-01` : `${year}-01-01`

    const today = new Date()
    const dob = new Date(dateOfBirth)
    const age = today.getFullYear() - dob.getFullYear() - (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0)

    setSaving(true)
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), age, dateOfBirth, favouriteCharacters, favouriteActivities, favouriteAnimals, favouritePlaces, lessons }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const profile = await res.json()
      router.push(`/profiles/${profile.id}` as string)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-2xl px-5 py-10">
        <div className="mb-8">
          <h1 className="font-display text-4xl font-bold text-night-800">{t('newTitle')}</h1>
          <p className="mt-2 text-night-500">{t('newSub')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="mb-1.5 block text-sm font-bold text-night-700" htmlFor="name">{t('nameLabel')}</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('namePlaceholder')}
              className="w-full rounded-xl border border-night-200 px-4 py-2.5 outline-none focus:border-star-400 focus:ring-2 focus:ring-star-200" />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-bold text-night-700">{t('birthdayLabel')}</p>
            <p className="mb-3 text-xs text-night-400">{t('birthdayHint')}</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs text-night-500" htmlFor="dob-day">{t('dayLabel')}</label>
                <select id="dob-day" value={dobDay} onChange={(e) => setDobDay(e.target.value)} className="w-full rounded-xl border border-night-200 px-3 py-2.5 text-sm outline-none focus:border-star-400">
                  <option value="">—</option>
                  {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-night-500" htmlFor="dob-month">{t('monthLabel')}</label>
                <select id="dob-month" value={dobMonth} onChange={(e) => setDobMonth(e.target.value)} className="w-full rounded-xl border border-night-200 px-3 py-2.5 text-sm outline-none focus:border-star-400">
                  <option value="">—</option>
                  {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-night-500" htmlFor="dob-year">{t('yearLabel')}</label>
                <select id="dob-year" value={dobYear} onChange={(e) => setDobYear(e.target.value)} className="w-full rounded-xl border border-night-200 px-3 py-2.5 text-sm outline-none focus:border-star-400">
                  <option value="">—</option>
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>

          <TagsField label={t('charsLabel')} values={favouriteCharacters} onChange={setFavouriteCharacters} placeholder={t('charsPlaceholder')} />
          <TagsField label={t('activitiesLabel')} values={favouriteActivities} onChange={setFavouriteActivities} placeholder={t('activitiesPlaceholder')} />
          <TagsField label={t('animalsLabel')} values={favouriteAnimals} onChange={setFavouriteAnimals} placeholder={t('animalsPlaceholder')} />
          <TagsField label={t('placesLabel')} values={favouritePlaces} onChange={setFavouritePlaces} placeholder={t('placesPlaceholder')} />

          <div>
            <p className="mb-2 text-sm font-bold text-night-700">{t('lessonsLabel')}</p>
            <div className="flex flex-wrap gap-2">
              {LESSON_OPTIONS.map((lesson) => (
                <button key={lesson} type="button"
                  onClick={() => setLessons((prev) => prev.includes(lesson) ? prev.filter((l) => l !== lesson) : [...prev, lesson])}
                  className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${lessons.includes(lesson) ? 'bg-night-700 text-moon-200' : 'border border-night-200 bg-white text-night-600 hover:border-night-400'}`}
                >
                  {lesson}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="rounded-xl bg-blush-100 px-4 py-3 text-sm font-bold text-blush-500">{error}</p>}

          <div className="flex gap-3">
            <button type="button" onClick={() => router.back()}
              className="rounded-full border border-night-200 px-6 py-3 font-bold text-night-600 transition hover:bg-night-50">
              {t('cancelButton')}
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-full bg-night-700 py-3 font-bold text-moon-200 transition hover:bg-night-600 disabled:opacity-60">
              {saving ? '…' : t('createButton')}
            </button>
          </div>
        </form>
      </main>
    </>
  )
}
