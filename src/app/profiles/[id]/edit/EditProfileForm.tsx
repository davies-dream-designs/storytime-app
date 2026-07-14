'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import { LESSON_OPTIONS, type ChildProfile } from '@/types'

function TagsField({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string
  values: string[]
  onChange: (vals: string[]) => void
  placeholder: string
}) {
  const [input, setInput] = useState('')

  function add() {
    const trimmed = input.trim()
    if (trimmed && !values.includes(trimmed)) onChange([...values, trimmed])
    setInput('')
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
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="text-star-400 hover:text-star-700" aria-label={`Remove ${v}`}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 15 }, (_, i) => currentYear - i)
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

function parseDOB(dob?: string) {
  if (!dob) return { day: '', month: '', year: '' }
  const [y, m, d] = dob.split('-')
  return { day: String(parseInt(d, 10)), month: String(parseInt(m, 10)), year: y }
}

export default function EditProfileForm({ profile }: { profile: ChildProfile }) {
  const router = useRouter()
  const initial = parseDOB(profile.dateOfBirth)

  const [name, setName] = useState(profile.name)
  const [dobDay, setDobDay] = useState(initial.day)
  const [dobMonth, setDobMonth] = useState(initial.month)
  const [dobYear, setDobYear] = useState(initial.year || String(currentYear - (profile.age ?? 0)))
  const [favouriteCharacters, setFavouriteCharacters] = useState(profile.favouriteCharacters)
  const [favouriteActivities, setFavouriteActivities] = useState(profile.favouriteActivities)
  const [favouriteAnimals, setFavouriteAnimals] = useState(profile.favouriteAnimals)
  const [favouritePlaces, setFavouritePlaces] = useState(profile.favouritePlaces)
  const [lessons, setLessons] = useState(profile.lessons)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Name is required'); return }
    if (!dobYear) { setError('Birth year is required'); return }

    const year = parseInt(dobYear, 10)
    const month = dobMonth ? parseInt(dobMonth, 10) : null
    const day = dobDay ? parseInt(dobDay, 10) : null

    const dateOfBirth = month && day
      ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      : month
        ? `${year}-${String(month).padStart(2, '0')}-01`
        : `${year}-01-01`

    const today = new Date()
    const dob = new Date(dateOfBirth)
    const age = today.getFullYear() - dob.getFullYear() - (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0)

    setSaving(true)
    try {
      const res = await fetch(`/api/profiles/${profile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), age, dateOfBirth, favouriteCharacters, favouriteActivities, favouriteAnimals, favouritePlaces, lessons }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      router.push(`/profiles/${profile.id}`)
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
          <button onClick={() => router.back()} className="mb-4 text-sm text-night-400 hover:text-night-600">← Back</button>
          <h1 className="font-display text-4xl font-bold text-night-800">Edit {profile.name}</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="mb-1.5 block text-sm font-bold text-night-700" htmlFor="name">Child&apos;s name *</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-night-200 px-4 py-2.5 outline-none focus:border-star-400 focus:ring-2 focus:ring-star-200"
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-bold text-night-700">Birthday</p>
            <p className="mb-3 text-xs text-night-400">Used to calculate their age for stories and to celebrate their birthday with a free story 🎂</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs text-night-500" htmlFor="dob-day">Day</label>
                <select id="dob-day" value={dobDay} onChange={(e) => setDobDay(e.target.value)} className="w-full rounded-xl border border-night-200 px-3 py-2.5 text-sm outline-none focus:border-star-400">
                  <option value="">—</option>
                  {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-night-500" htmlFor="dob-month">Month</label>
                <select id="dob-month" value={dobMonth} onChange={(e) => setDobMonth(e.target.value)} className="w-full rounded-xl border border-night-200 px-3 py-2.5 text-sm outline-none focus:border-star-400">
                  <option value="">—</option>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-night-500" htmlFor="dob-year">Year *</label>
                <select id="dob-year" value={dobYear} onChange={(e) => setDobYear(e.target.value)} className="w-full rounded-xl border border-night-200 px-3 py-2.5 text-sm outline-none focus:border-star-400">
                  <option value="">—</option>
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>

          <TagsField label="Favourite characters or toys" values={favouriteCharacters} onChange={setFavouriteCharacters} placeholder="e.g. Piggy the astronaut pig" />
          <TagsField label="Favourite activities" values={favouriteActivities} onChange={setFavouriteActivities} placeholder="e.g. space, pancakes, trucks" />
          <TagsField label="Favourite animals" values={favouriteAnimals} onChange={setFavouriteAnimals} placeholder="e.g. elephants, dogs" />
          <TagsField label="Favourite places" values={favouritePlaces} onChange={setFavouritePlaces} placeholder="e.g. the beach, the park" />

          <div>
            <p className="mb-2 text-sm font-bold text-night-700">Lessons &amp; themes to explore</p>
            <div className="flex flex-wrap gap-2">
              {LESSON_OPTIONS.map((lesson) => (
                <button
                  key={lesson}
                  type="button"
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
            <button type="button" onClick={() => router.back()} className="rounded-full border border-night-200 px-6 py-3 font-bold text-night-600 transition hover:bg-night-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 rounded-full bg-night-700 py-3 font-bold text-moon-200 transition hover:bg-night-600 disabled:opacity-60">
              {saving ? 'Saving…' : 'Save changes ✨'}
            </button>
          </div>
        </form>
      </main>
    </>
  )
}
