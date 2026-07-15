import { notFound, redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import Nav from '@/components/Nav'
import { db } from '@/lib/db'
import BookStatusPanel from './BookStatusPanel'

export default async function BookProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { id } = await params
  const t = await getTranslations('books')
  const project = await db.bookProjects.getById(id)
  if (!project || project.userId !== userId) notFound()

  const story = await db.stories.getById(project.sourceStoryId)
  if (!story || story.userId !== userId) notFound()

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-5 py-10">
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-2 text-sm text-night-400">
            <Link href="/books" className="hover:text-night-600">{t('backToBooks')}</Link>
            <span>·</span>
            <Link href={`/stories/${story.id}` as string} className="hover:text-night-600">{story.title}</Link>
          </div>
          <h1 className="font-display text-4xl font-bold text-night-800">{t('detailTitle')}</h1>
          <p className="mt-2 text-night-500">{t('detailSub', { title: story.title })}</p>
        </div>

        <BookStatusPanel initialProject={project} />

        <section className="mt-8 rounded-3xl border border-night-100 bg-white p-8 shadow-sm">
          <h2 className="font-display text-2xl font-bold text-night-800">{t('bookPlanTitle')}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-night-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-night-400">{t('ageBandLabel')}</p>
              <p className="mt-2 font-display text-2xl font-bold text-night-700">{project.ageBand}</p>
            </div>
            <div className="rounded-2xl bg-night-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-night-400">{t('pageCountLabel')}</p>
              <p className="mt-2 font-display text-2xl font-bold text-night-700">{project.pageCount}</p>
            </div>
            <div className="rounded-2xl bg-night-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-night-400">{t('spreadCountLabel')}</p>
              <p className="mt-2 font-display text-2xl font-bold text-night-700">{project.spreadCount}</p>
            </div>
          </div>

          {project.spreads.length > 0 ? (
            <div className="mt-6 space-y-3">
              {project.spreads.map((spread) => (
                <div key={spread.id} className="rounded-2xl border border-night-100 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-night-700">
                      {t('spreadLabel', { start: spread.pageStart, end: spread.pageEnd })}
                    </p>
                    <span className="rounded-full bg-star-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-star-700">
                      {spread.layoutType}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-night-500">{spread.sceneBrief}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-night-500">{t('spreadsPending')}</p>
          )}
        </section>
      </main>
    </>
  )
}
