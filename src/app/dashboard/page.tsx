import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import Nav from '@/components/Nav'
import { db } from '@/lib/db'

export default async function Dashboard() {
  const { userId } = await auth()
  const profiles = db.profiles.getByUserId(userId!)
  const stories = db.stories.getByUserId(userId!).sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
  const recentStories = stories.slice(0, 3)

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-5 py-10">
        {/* Welcome */}
        <div className="mb-10">
          <h1 className="font-display text-4xl font-bold text-night-800">
            Good evening 🌙
          </h1>
          <p className="mt-2 text-night-500">
            {stories.length === 0
              ? 'Ready to create your first magical story?'
              : `You have ${stories.length} stor${stories.length === 1 ? 'y' : 'ies'} across ${profiles.length} profile${profiles.length === 1 ? '' : 's'}.`}
          </p>
        </div>

        {/* Stats */}
        <div className="mb-10 grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Child profiles', value: profiles.length, icon: '👶', href: '/profiles' },
            { label: 'Stories created', value: stories.length, icon: '📖', href: '/stories' },
            {
              label: 'Last story',
              value: recentStories[0] ? new Date(recentStories[0].createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—',
              icon: '✨',
              href: recentStories[0] ? `/stories/${recentStories[0].id}` : '/stories',
            },
          ].map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className="flex items-center gap-4 rounded-2xl border border-night-100 bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-night-50 text-2xl">
                {stat.icon}
              </div>
              <div>
                <p className="font-display text-2xl font-bold text-night-800">{stat.value}</p>
                <p className="text-sm text-night-400">{stat.label}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Quick actions */}
        <div className="mb-10 grid gap-4 sm:grid-cols-2">
          <Link
            href="/stories/new"
            className="flex items-center gap-4 rounded-2xl bg-night-700 px-6 py-5 text-white transition hover:bg-night-600"
          >
            <span className="text-3xl" aria-hidden>✨</span>
            <div>
              <p className="font-display text-lg font-bold">Generate a new story</p>
              <p className="text-sm text-night-200">Pick a profile, choose a theme, done.</p>
            </div>
          </Link>
          <Link
            href="/profiles/new"
            className="flex items-center gap-4 rounded-2xl border-2 border-dashed border-night-200 px-6 py-5 text-night-600 transition hover:border-night-400 hover:text-night-800"
          >
            <span className="text-3xl" aria-hidden>👶</span>
            <div>
              <p className="font-display text-lg font-bold">Add a child profile</p>
              <p className="text-sm text-night-400">Their name, age, favourites & more.</p>
            </div>
          </Link>
        </div>

        {/* Recent stories */}
        {recentStories.length > 0 && (
          <section>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold text-night-800">Recent stories</h2>
              <Link href="/stories" className="text-sm font-bold text-star-500 hover:text-star-600">
                View all →
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {recentStories.map((story) => (
                <Link
                  key={story.id}
                  href={`/stories/${story.id}`}
                  className="group rounded-2xl border border-night-100 bg-white p-5 shadow-sm transition hover:shadow-md"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-xl" aria-hidden>📖</span>
                    <span className="rounded-full bg-star-100 px-3 py-0.5 text-xs font-bold text-star-600">
                      {story.theme}
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-bold text-night-800 group-hover:text-night-600 line-clamp-2">
                    {story.title}
                  </h3>
                  <p className="mt-1 text-sm text-night-400">
                    For {story.profileName} ·{' '}
                    {new Date(story.createdAt).toLocaleDateString('en-AU', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                  <p className="mt-1 text-xs text-night-300">{story.wordCount} words · {story.pages.length} pages</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {stories.length === 0 && profiles.length === 0 && (
          <div className="rounded-3xl border-2 border-dashed border-night-200 p-16 text-center">
            <div className="text-5xl" aria-hidden>🌙</div>
            <h2 className="mt-4 font-display text-2xl font-bold text-night-700">
              Your first story starts here
            </h2>
            <p className="mt-2 text-night-400">
              Create a child profile, then generate a personalised bedtime story in seconds.
            </p>
            <Link
              href="/profiles/new"
              className="mt-6 inline-block rounded-full bg-night-700 px-6 py-3 font-bold text-moon-200 transition hover:bg-night-600"
            >
              Create a profile
            </Link>
          </div>
        )}
      </main>
    </>
  )
}
