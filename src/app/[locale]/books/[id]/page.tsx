import { notFound, redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import Nav from '@/components/Nav'
import { db } from '@/lib/db'
import { isDownloadableBookAssetUrl, isInlineBookAssetUrl } from '@/lib/print-books/assets'
import BookStatusPanel from './BookStatusPanel'

function getSpreadToneClass(layoutType: string) {
  switch (layoutType) {
    case 'hero':
      return 'bg-star-50 text-star-700'
    case 'quiet':
      return 'bg-sky-50 text-sky-700'
    case 'front_matter':
    case 'end_matter':
      return 'bg-night-100 text-night-600'
    default:
      return 'bg-lilac-50 text-lilac-700'
  }
}

export default async function BookProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { id } = await params
  const t = await getTranslations('books')
  const project = await db.bookProjects.getById(id)
  if (!project || project.userId !== userId) notFound()

  const story = await db.stories.getById(project.sourceStoryId)
  if (!story || story.userId !== userId) notFound()
  const coverSpread = project.spreads.find((spread) => spread.sequence === 1 || spread.title === 'Cover')
  const hasProofingErrors = Boolean(project.assets.proofingErrors && project.assets.proofingErrors.length > 0)
  const previewPdfUrl = isDownloadableBookAssetUrl(project.assets.previewPdfUrl) ? project.assets.previewPdfUrl : undefined
  const printPdfUrl = isDownloadableBookAssetUrl(project.assets.printPdfUrl) ? project.assets.printPdfUrl : undefined
  const hasInlineFallbackExports = isInlineBookAssetUrl(project.assets.previewPdfUrl) || isInlineBookAssetUrl(project.assets.printPdfUrl)

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

        {project.assets.coverImageUrl ? (
          <section className="mt-8 rounded-3xl border border-night-100 bg-white p-8 shadow-sm">
            <div className="mx-auto max-w-md">
              {/* Dynamic Blob URLs and data URL fallbacks do not fit the current next/image config. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={project.assets.coverImageUrl}
                alt={coverSpread?.title || story.title}
                className="w-full rounded-2xl border border-night-100 object-cover shadow-sm"
              />
            </div>
          </section>
        ) : null}

        {previewPdfUrl || printPdfUrl || hasInlineFallbackExports ? (
          <section className="mt-8 rounded-3xl border border-night-100 bg-white p-8 shadow-sm">
            <h2 className="font-display text-2xl font-bold text-night-800">{t('downloadsTitle')}</h2>
            {previewPdfUrl || printPdfUrl ? (
              <div className="mt-4 flex flex-wrap gap-3">
                {previewPdfUrl ? (
                  <a
                    href={previewPdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full bg-night-700 px-5 py-3 text-sm font-bold text-moon-200 transition hover:bg-night-600"
                  >
                    {t('previewPdfButton')}
                  </a>
                ) : null}
                {printPdfUrl ? (
                  <a
                    href={printPdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-night-200 px-5 py-3 text-sm font-bold text-night-700 transition hover:bg-night-50"
                  >
                    {t('printPdfButton')}
                  </a>
                ) : null}
              </div>
            ) : null}
            {hasInlineFallbackExports ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-bold text-amber-800">{t('fallbackExportsTitle')}</p>
                <p className="mt-1 text-sm text-amber-900">{t('fallbackExportsBody')}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        {project.assets.exportProfile || project.assets.proofingWarnings?.length || project.assets.proofingErrors?.length ? (
          <section className="mt-8 rounded-3xl border border-night-100 bg-white p-8 shadow-sm">
            <h2 className="font-display text-2xl font-bold text-night-800">{t('proofingTitle')}</h2>
            <p className="mt-3 text-night-600">
              {hasProofingErrors
                ? t('proofingBlocked')
                : project.assets.proofingPassed
                  ? t('proofingPassed')
                  : t('proofingReviewNeeded')}
            </p>

            {project.assets.exportProfile ? (
              <div className="mt-4 rounded-2xl bg-night-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-night-400">{t('exportProfileLabel')}</p>
                <p className="mt-2 text-sm font-medium text-night-700">{project.assets.exportProfile}</p>
              </div>
            ) : null}

            {project.assets.proofingWarnings && project.assets.proofingWarnings.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-bold text-amber-800">{t('proofingWarningsLabel')}</p>
                <ul className="mt-2 space-y-2 text-sm text-amber-900">
                  {project.assets.proofingWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {project.assets.proofingErrors && project.assets.proofingErrors.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <p className="text-sm font-bold text-rose-800">{t('proofingErrorsLabel')}</p>
                <ul className="mt-2 space-y-2 text-sm text-rose-900">
                  {project.assets.proofingErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

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
            <div className="mt-6 space-y-4">
              {project.spreads.map((spread) => (
                <article key={spread.id} className="rounded-3xl border border-night-100 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-night-400">
                        {t('spreadNumberLabel', { sequence: spread.sequence })}
                      </p>
                      <p className="mt-1 font-bold text-night-700">
                        {t('spreadLabel', { start: spread.pageStart, end: spread.pageEnd })}
                      </p>
                      {spread.title ? (
                        <p className="mt-1 text-sm font-medium text-night-500">{spread.title}</p>
                      ) : null}
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${getSpreadToneClass(spread.layoutType)}`}
                    >
                      {t(`layout.${spread.layoutType}` as 'layout.text_art')}
                    </span>
                  </div>

                  <p className="mt-4 text-sm text-night-500">{spread.sceneBrief}</p>

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl bg-night-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-night-400">
                        {t('leftPageTextLabel')}
                      </p>
                      <p className="mt-2 whitespace-pre-line text-sm leading-7 text-night-700">
                        {spread.leftPageText || t('emptyTextFallback')}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-night-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-night-400">
                        {t('rightPageTextLabel')}
                      </p>
                      <p className="mt-2 whitespace-pre-line text-sm leading-7 text-night-700">
                        {spread.rightPageText || t('imageLedFallback')}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-dashed border-night-200 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-night-400">
                      {t('illustrationIntentLabel')}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-night-600">{spread.illustrationPrompt}</p>
                  </div>
                </article>
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
