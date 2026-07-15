import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import Nav from '@/components/Nav'
import { db } from '@/lib/db'

export default async function BooksPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const t = await getTranslations('books')
  const projects = (await db.bookProjects.getByUserId(userId)).sort((a, b) =>
    a.createdAt > b.createdAt ? -1 : 1
  )
  const stories = await db.stories.getByUserId(userId)
  const storyTitleById = new Map(stories.map((story) => [story.id, story.title]))

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-5 py-10">
        <div className="mb-8">
          <h1 className="font-display text-4xl font-bold text-night-800">{t('listTitle')}</h1>
          <p className="mt-2 text-night-500">{t('listSub')}</p>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-3xl border border-night-100 bg-white p-10 text-center shadow-sm">
            <p className="font-display text-2xl font-bold text-night-800">{t('emptyTitle')}</p>
            <p className="mt-3 text-night-500">{t('emptySub')}</p>
            <Link
              href="/stories"
              className="mt-6 inline-block rounded-full bg-night-700 px-5 py-2.5 text-sm font-bold text-moon-200 transition hover:bg-night-600"
            >
              {t('emptyButton')}
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/books/${project.id}` as string}
                className="rounded-3xl border border-night-100 bg-white p-6 shadow-sm transition hover:border-star-200 hover:shadow-md"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wide text-star-600">{project.currentStageLabel}</p>
                    <h2 className="mt-2 font-display text-2xl font-bold text-night-800">
                      {storyTitleById.get(project.sourceStoryId) ?? t('untitledBook')}
                    </h2>
                    <p className="mt-1 text-sm text-night-500">
                      {t('spreadProgress', {
                        completed: project.completedSpreads,
                        total: project.totalSpreads,
                      })}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-night-50 px-4 py-3 text-sm font-bold text-night-600">
                    {project.status}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
