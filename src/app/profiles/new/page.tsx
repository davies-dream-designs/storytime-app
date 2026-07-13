'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add()
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-night-200 px-4 py-2.5 text-sm outline-none focus:border-star-400 focus:ring-2 focus:ring-star-200"
        />
        <button
          type="button"
          onClick={add}
          className="rounded-xl bg-night-100 px-4 py-2.5 text-sm font-bold text-night-600 hover:bg-night-200"
        >
          Add
        </button>
      </div>
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((v) => (
            <span
              key={v}
              className="flex items-center gap-1.5 rounded-full bg-star-100 px-3 py-1 text-sm font-bold text-star-700"
            >
              {v}
              <button
                type="button"
                onClick={() => remove(v)}
                className="text-star-400 hover:text-star-700"
                aria-label={`Remove ${v}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function NewProfilePage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [favouriteCharacters, setFavouriteCharacters] = useState<string[]>([])
  const [favouriteActivities, setFavouriteActivities] = useState<string[]>([])
  const [favouriteAnimals, setFavouriteAnimals] = useState<string[]>([])
  const [favouritePlaces, setFavouritePlaces] = useState<string[]>([])
  const [lessons, setLessons] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Name is required'); return }
    const ageNum = parseInt(age, 10)
    if (!ageNum || ageNum < 1 || ageNum > 12) { setError('Age must be between 1 and 12'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), age: ageNum, favouriteCharacters, favouriteActivities, favouriteAnimals, favouritePlaces, lessons }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const profile = await res.json()
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
          <h1 className="font-display text-4xl font-bold text-night-800">Add a child</h1>
          <p className="mt-2 text-night-500">
            Every detail you add makes their stories more magical.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-bold text-night-700" htmlFor="name">
                Child&apos;s name *
              </label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Max"
                className="w-full rounded-xl border border-night-200 px-4 py-2.5 outline-none focus:border-star-400 focus:ring-2 focus:ring-star-200"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-bold text-night-700" htmlFor="age">
                Age *
              </label>
              <input
                id="age"
                type="number"
                min="1"
                max="12"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="e.g. 3"
                className="w-full rounded-xl border border-night-200 px-4 py-2.5 outline-none focus:border-star-400 focus:ring-2 focus:ring-star-200"
              />
            </div>
          </div>

          <TagsField
            label="Favourite characters or toys"
            values={favouriteCharacters}
            onChange={setFavouriteCharacters}
            placeholder="e.g. Piggy the astronaut pig"
          />
          <TagsField
            label="Favourite activities"
            values={favouriteActivities}
            onChange={setFavouriteActivities}
            placeholder="e.g. space, pancakes, trucks"
          />
          <TagsField
            label="Favourite animals"
            values={favouriteAnimals}
            onChange={setFavouriteAnimals}
            placeholder="e.g. elephants, dogs"
          />
          <TagsField
            label="Favourite places"
            values={favouritePlaces}
            onChange={setFavouritePlaces}
            placeholder="e.g. the beach, the park"
          />

          <div>
            <p className="mb-2 text-sm font-bold text-night-700">Lessons &amp; themes to explore</p>
            <div className="flex flex-wrap gap-2">
              {LESSON_OPTIONS.map((lesson) => (
                <button
                  key={lesson}
                  type="button"
                  onClick={() =>
                    setLessons((prev) =>
                      prev.includes(lesson) ? prev.filter((l) => l !== lesson) : [...prev, lesson]
                    )
                  }
                  className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                    lessons.includes(lesson)
                      ? 'bg-night-700 text-moon-200'
                      : 'border border-night-200 bg-white text-night-600 hover:border-night-400'
                  }`}
                >
                  {lesson}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-blush-100 px-4 py-3 text-sm font-bold text-blush-500">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-full border border-night-200 px-6 py-3 font-bold text-night-600 transition hover:bg-night-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-full bg-night-700 py-3 font-bold text-moon-200 transition hover:bg-night-600 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Create profile ✨'}
            </button>
          </div>
        </form>
      </main>
    </>
  )
}
