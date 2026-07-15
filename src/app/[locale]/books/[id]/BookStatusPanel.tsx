'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import type { BookProject } from '@/types/printBook'

type BookStatusPayload = Pick<
  BookProject,
  'id' | 'status' | 'currentStageLabel' | 'completedSpreads' | 'totalSpreads' | 'updatedAt' | 'readyAt' | 'errorCode' | 'errorMessage'
>

function isTerminal(status: BookProject['status']): boolean {
  return status === 'ready' || status === 'failed'
}

export default function BookStatusPanel({ initialProject }: { initialProject: BookProject }) {
  const t = useTranslations('books')
  const router = useRouter()
  const [project, setProject] = useState(initialProject)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    if (isTerminal(project.status)) return

    const interval = window.setInterval(async () => {
      const res = await fetch(`/api/books/${project.id}/status`, { cache: 'no-store' })
      if (!res.ok) return
      const next = (await res.json()) as BookStatusPayload
      setProject((current) => ({ ...current, ...next }))

      if (next.status === 'ready') {
        router.refresh()
      }
    }, 4000)

    return () => window.clearInterval(interval)
  }, [project.id, project.status, router])

  async function handleRetry() {
    setRetrying(true)
    const res = await fetch(`/api/books/${project.id}/build`, { method: 'POST' })
    if (res.ok) {
      const next = (await res.json()) as BookProject
      setProject(next)
      router.refresh()
    }
    setRetrying(false)
  }

  const progress = project.totalSpreads > 0
    ? Math.round((project.completedSpreads / project.totalSpreads) * 100)
    : 0

  return (
    <section className="rounded-3xl border border-night-100 bg-white p-8 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-star-600">{t('statusLabel')}</p>
          <h2 className="mt-2 font-display text-3xl font-bold text-night-800">{project.currentStageLabel}</h2>
          <p className="mt-2 text-night-500">
            {t('spreadProgress', {
              completed: project.completedSpreads,
              total: project.totalSpreads,
            })}
          </p>
        </div>
        <div className="rounded-2xl bg-night-50 px-4 py-3 text-right">
          <p className="text-xs font-bold uppercase tracking-wide text-night-400">{t('progressLabel')}</p>
          <p className="mt-1 font-display text-2xl font-bold text-night-700">{progress}%</p>
        </div>
      </div>

      <div className="mt-6 h-3 overflow-hidden rounded-full bg-night-100">
        <div
          className="h-full rounded-full bg-star-400 transition-all"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>

      {project.status === 'failed' ? (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="font-bold text-rose-700">{t('failedTitle')}</p>
          <p className="mt-1 text-sm text-rose-600">{project.errorMessage ?? t('failedFallback')}</p>
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="mt-4 rounded-full bg-rose-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-500 disabled:opacity-60"
          >
            {retrying ? t('retryingButton') : t('retryButton')}
          </button>
        </div>
      ) : null}

      {project.status === 'ready' ? (
        <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="font-bold text-green-700">{t('readyTitle')}</p>
          <p className="mt-1 text-sm text-green-700">{t('readySub')}</p>
        </div>
      ) : null}
    </section>
  )
}
