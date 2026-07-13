import Link from 'next/link'
import Nav from '@/components/Nav'
import { db } from '@/lib/db'

export default function ProfilesPage() {
  const profiles = db.profiles.getAll()

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-display text-4xl font-bold text-night-800">Child profiles</h1>
            <p className="mt-1 text-night-500">Each profile personalises every story.</p>
          </div>
          <Link
            href="/profiles/new"
            className="rounded-full bg-night-700 px-5 py-2.5 text-sm font-bold text-moon-200 transition hover:bg-night-600"
          >
            + Add child
          </Link>
        </div>

        {profiles.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-night-200 p-16 text-center">
            <div className="text-5xl" aria-hidden>👶</div>
            <h2 className="mt-4 font-display text-2xl font-bold text-night-700">No profiles yet</h2>
            <p className="mt-2 text-night-400">Add your first child to get started.</p>
            <Link
              href="/profiles/new"
              className="mt-6 inline-block rounded-full bg-night-700 px-6 py-3 font-bold text-moon-200 transition hover:bg-night-600"
            >
              Add a child
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((profile) => {
              const storyCount = db.stories.getByProfileId(profile.id).length
              return (
                <Link
                  key={profile.id}
                  href={`/profiles/${profile.id}`}
                  className="group rounded-2xl border border-night-100 bg-white p-6 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-star-300 to-moon-300 font-display text-2xl font-bold text-night-800">
                      {profile.name[0].toUpperCase()}
                    </div>
                    <span className="rounded-full bg-night-50 px-3 py-1 text-sm font-bold text-night-500">
                      Age {profile.age}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-xl font-bold text-night-800 group-hover:text-night-600">
                    {profile.name}
                  </h3>
                  {profile.favouriteCharacters.length > 0 && (
                    <p className="mt-1 text-sm text-night-400 line-clamp-1">
                      Loves: {profile.favouriteCharacters.join(', ')}
                    </p>
                  )}
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm text-night-400">
                      {storyCount} stor{storyCount === 1 ? 'y' : 'ies'}
                    </span>
                    <Link
                      href={`/stories/new?profileId=${profile.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-full bg-night-700 px-4 py-1.5 text-xs font-bold text-moon-200 transition hover:bg-night-600"
                    >
                      ✨ Generate
                    </Link>
                  </div>
                </Link>
              )
            })}
            <Link
              href="/profiles/new"
              className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-night-200 p-6 text-night-400 transition hover:border-night-400 hover:text-night-600"
            >
              <span className="text-3xl" aria-hidden>+</span>
              <span className="mt-2 font-display font-bold">Add another child</span>
            </Link>
          </div>
        )}
      </main>
    </>
  )
}
