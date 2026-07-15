import { auth } from '@clerk/nextjs/server'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import Nav from '@/components/Nav'
import StoryLibrary from '@/components/StoryLibrary'
import { db } from '@/lib/db'

export default async function StoriesPage() {
  const { userId } = await auth()
  const t = await getTranslations('stories')
  const stories = (await db.stories.getByUserId(userId!)).sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
  const profiles = await db.profiles.getByUserId(userId!)

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-display text-4xl font-bold text-night-800">{t('libraryTitle')}</h1>
            <p className="mt-1 text-night-500">
              {stories.length === 1 ? t('libraryCountSingle') : t('libraryCount', { count: stories.length })}
            </p>
          </div>
          <Link
            href="/stories/new"
            className="rounded-full bg-night-700 px-5 py-2.5 text-sm font-bold text-moon-200 transition hover:bg-night-600"
          >
            {t('generateButton')}
          </Link>
        </div>
        <StoryLibrary stories={stories} profiles={profiles} />
      </main>
    </>
  )
}
