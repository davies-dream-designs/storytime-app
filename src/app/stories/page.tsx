import Link from 'next/link'
import Nav from '@/components/Nav'
import { db } from '@/lib/db'

export default function StoriesPage() {
  const stories = db.stories.getAll().sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
  const profiles = db.profiles.getAll()

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-display text-4xl font-bold text-night-800">Story library</h1>
            <p className="mt-1 text-night-500">
              {stories.length} stor{stories.length === 1 ? 'y' : 'ies'} in your collection.
            </p>
          </div>
          <Link
            href="/stories/new"
            className="rounded-full bg-night-700 px-5 py-2.5 text-sm font-bold text-moon-200 transition hover:bg-night-600"
          >
            ✨ Generate story
          </Link>
        </div>

        {stories.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-night-200 p-16 text-center">
            <div className="text-5xl" aria-hidden>📚</div>
            <h2 className="mt-4 font-display text-2xl font-bold text-night-700">Your library is empty</h2>
            <p className="mt-2 text-night-400">
              {profiles.length === 0
                ? 'First, create a child profile. Then generate your first story!'
                : 'Generate your first personalised bedtime story.'}
            </p>
            <Link
              href={profiles.length === 0 ? '/profiles/new' : '/stories/new'}
              className="mt-6 inline-block rounded-full bg-night-700 px-6 py-3 font-bold text-moon-200 transition hover:bg-night-600"
            >
              {profiles.length === 0 ? 'Create a profile' : 'Generate a story'}
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {stories.map((story) => (
              <Link
                key={story.id}
                href={`/stories/${story.id}`}
                className="group rounded-2xl border border-night-100 bg-white p-6 shadow-sm transition hover:shadow-md"
              >
                <div className="mb-4 flex items-start justify-between">
                  <span className="text-3xl" aria-hidden>📖</span>
                  <span className="rounded-full bg-star-100 px-3 py-1 text-xs font-bold text-star-600">
                    {story.theme}
                  </span>
                </div>
                <h3 className="font-display text-lg font-bold text-night-800 group-hover:text-night-600 line-clamp-2">
                  {story.title}
                </h3>
                <p className="mt-2 text-sm text-night-400">
                  For {story.profileName}
                </p>
                <div className="mt-3 flex items-center gap-3 text-xs text-night-300">
                  <span>{story.wordCount} words</span>
                  <span>·</span>
                  <span>{story.pages.length} pages</span>
                  <span>·</span>
                  <span>
                    {new Date(story.createdAt).toLocaleDateString('en-AU', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <span className="flex-1 rounded-xl bg-night-50 py-2 text-center text-xs font-bold text-night-600">
                    Read →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
