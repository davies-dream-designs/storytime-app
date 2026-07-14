import { notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import Nav from '@/components/Nav'
import { db } from '@/lib/db'
import StoryReader from './StoryReader'
import ShareButton from './ShareButton'

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  const { id } = await params
  const story = await db.stories.getById(id)
  if (!story || story.userId !== userId) notFound()

  const profile = await db.profiles.getById(story.profileId)

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-5 py-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Link href="/stories" className="text-sm text-night-400 hover:text-night-600">← Library</Link>
              <span className="text-night-300">·</span>
              {profile && (
                <Link href={`/profiles/${profile.id}`} className="text-sm text-star-500 hover:text-star-600">
                  {story.profileName}
                </Link>
              )}
            </div>
            <h1 className="font-display text-3xl font-bold text-night-800 sm:text-4xl">{story.title}</h1>
            <p className="mt-1 text-night-400">
              {story.theme} · {story.wordCount} words · {story.pages.length} pages ·{' '}
              {new Date(story.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="flex flex-shrink-0 flex-wrap gap-2">
            <ShareButton storyId={id} />
            <a href={`/stories/${id}/print`} target="_blank" rel="noopener noreferrer" className="rounded-full border border-night-200 px-4 py-2 text-sm font-bold text-night-600 transition hover:bg-night-50">
              🖨️ Print / PDF
            </a>
<Link href={`/stories/new?profileId=${story.profileId}`} className="rounded-full bg-night-700 px-4 py-2 text-sm font-bold text-moon-200 transition hover:bg-night-600">
              ✨ New story
            </Link>
          </div>
        </div>
        <StoryReader story={story} />
      </main>
    </>
  )
}
