import { notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import Nav from '@/components/Nav'
import { db } from '@/lib/db'
import { getAge } from '@/types'
import DeleteProfileButton from './DeleteProfileButton'

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  const { id } = await params
  const profile = await db.profiles.getById(id)
  if (!profile || profile.userId !== userId) notFound()

  const [storiesRaw, characters] = await Promise.all([
    db.stories.getByProfileId(id),
    db.characters.getByProfileId(id),
  ])
  const stories = storiesRaw.filter((s) => s.userId === userId).sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
  const myCharacters = characters.filter((c) => c.userId === userId)

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-5 py-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-star-300 to-moon-300 font-display text-3xl font-bold text-night-800">
              {profile.name[0].toUpperCase()}
            </div>
            <div>
              <h1 className="font-display text-4xl font-bold text-night-800">{profile.name}</h1>
              <p className="text-night-500">Age {getAge(profile)} · {stories.length} stor{stories.length === 1 ? 'y' : 'ies'}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link href={`/stories/new?profileId=${id}`} className="rounded-full bg-night-700 px-5 py-2.5 font-bold text-moon-200 transition hover:bg-night-600">
              ✨ Generate story
            </Link>
            <DeleteProfileButton profileId={id} />
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-1 space-y-5">
            <div className="rounded-2xl border border-night-100 bg-white p-5">
              <h2 className="mb-4 font-display text-lg font-bold text-night-700">Profile details</h2>
              <div className="space-y-4">
                {[
                  { label: 'Favourite characters & toys', values: profile.favouriteCharacters },
                  { label: 'Favourite activities', values: profile.favouriteActivities },
                  { label: 'Favourite animals', values: profile.favouriteAnimals },
                  { label: 'Favourite places', values: profile.favouritePlaces },
                  { label: 'Themes & lessons', values: profile.lessons },
                ].map(({ label, values }) =>
                  values.length > 0 ? (
                    <div key={label}>
                      <p className="text-xs font-bold uppercase tracking-wide text-night-400">{label}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {values.map((v) => (
                          <span key={v} className="rounded-full bg-night-50 px-3 py-1 text-sm text-night-600">{v}</span>
                        ))}
                      </div>
                    </div>
                  ) : null
                )}
              </div>
              <Link href={`/profiles/${id}/edit`} className="mt-5 block w-full rounded-xl border border-night-200 py-2 text-center text-sm font-bold text-night-600 transition hover:bg-night-50">
                Edit profile
              </Link>
            </div>

            {myCharacters.length > 0 && (
              <div className="rounded-2xl border border-night-100 bg-white p-5">
                <h2 className="mb-4 font-display text-lg font-bold text-night-700">Character memory</h2>
                <div className="space-y-3">
                  {myCharacters.map((c) => (
                    <div key={c.id} className="rounded-xl bg-star-50 p-3">
                      <p className="font-bold text-night-700">{c.name}</p>
                      {c.description && <p className="mt-0.5 text-xs text-night-500">{c.description}</p>}
                    </div>
                  ))}
                </div>
                <Link href={`/profiles/${id}/characters`} className="mt-4 block text-center text-sm font-bold text-star-500 hover:text-star-600">
                  Manage characters →
                </Link>
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold text-night-800">Stories</h2>
              <Link href={`/stories/new?profileId=${id}`} className="text-sm font-bold text-star-500 hover:text-star-600">+ New story</Link>
            </div>
            {stories.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-night-200 p-10 text-center">
                <div className="text-3xl" aria-hidden>📖</div>
                <p className="mt-3 font-display font-bold text-night-600">No stories yet</p>
                <p className="text-sm text-night-400">Generate the first story for {profile.name}.</p>
                <Link href={`/stories/new?profileId=${id}`} className="mt-4 inline-block rounded-full bg-night-700 px-5 py-2.5 text-sm font-bold text-moon-200 transition hover:bg-night-600">
                  Generate a story
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {stories.map((story) => (
                  <Link key={story.id} href={`/stories/${story.id}`} className="flex items-center justify-between rounded-2xl border border-night-100 bg-white p-5 transition hover:shadow-md">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-2xl flex-shrink-0" aria-hidden>📖</span>
                      <div className="min-w-0">
                        <p className="font-display font-bold text-night-800 truncate">{story.title}</p>
                        <p className="text-sm text-night-400">{story.theme} · {new Date(story.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      </div>
                    </div>
                    <span className="ml-4 flex-shrink-0 text-sm text-night-300">{story.wordCount}w →</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
