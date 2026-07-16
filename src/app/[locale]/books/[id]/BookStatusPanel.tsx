'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import type { BookProject } from '@/types/printBook'
import { getBookReadinessState } from '@/lib/print-books/readiness'

type BookStatusPayload = Pick<
  BookProject,
  'id' | 'status' | 'currentStageLabel' | 'completedSpreads' | 'totalSpreads' | 'updatedAt' | 'readyAt' | 'errorCode' | 'errorMessage' | 'assets'
>

function isTerminal(status: BookProject['status']): boolean {
  return status === 'ready' || status === 'failed'
}

export default function BookStatusPanel({ initialProject }: { initialProject: BookProject }) {
  const t = useTranslations('books')
  const router = useRouter()
  const [project, setProject] = useState(initialProject)
  const [retrying, setRetrying] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  const [generatingArt, setGeneratingArt] = useState(false)
  const [refreshingExports, setRefreshingExports] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [startingBuild, setStartingBuild] = useState(false)
  const buildStartedRef = useRef(false)
  const continuationInFlightRef = useRef(false)

  useEffect(() => {
    if (project.status !== 'queued' || buildStartedRef.current) return

    buildStartedRef.current = true
    setStartingBuild(true)

    void fetch(`/api/books/${project.id}/build`, { method: 'POST', keepalive: true })
      .then(async (res) => {
        if (!res.ok) return
        const next = (await res.json()) as BookProject
        setProject(next)
        router.refresh()
      })
      .catch(() => {
        buildStartedRef.current = false
      })
      .finally(() => {
        setStartingBuild(false)
      })
  }, [project.assets.lastBuildMode, project.id, project.status, router])

  useEffect(() => {
    if (isTerminal(project.status)) return

    const interval = window.setInterval(async () => {
      if (continuationInFlightRef.current) return
      continuationInFlightRef.current = true

      try {
        if (project.assets.lastBuildMode === 'art' && project.status === 'illustrating') {
          const res = await fetch(`/api/books/${project.id}/build`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'art' }),
          })
          if (res.ok) {
            const next = (await res.json()) as BookProject
            setProject(next)
            if (next.status === 'ready') router.refresh()
          }
        } else {
          const res = await fetch(`/api/books/${project.id}/status`, { cache: 'no-store' })
          if (!res.ok) return
          const next = (await res.json()) as BookStatusPayload
          setProject((current) => ({ ...current, ...next }))

          if (next.status === 'ready') {
            router.refresh()
          }
        }
      } finally {
        continuationInFlightRef.current = false
      }
    }, 4000)

    return () => window.clearInterval(interval)
  }, [project.assets.lastBuildMode, project.id, project.status, router])

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

  async function handleRebuild() {
    setRebuilding(true)
    const res = await fetch(`/api/books/${project.id}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'full' }),
    })
    if (res.ok) {
      const next = (await res.json()) as BookProject
      setProject(next)
      router.refresh()
    }
    setRebuilding(false)
  }

  async function handleRefreshExports() {
    setRefreshingExports(true)
    const res = await fetch(`/api/books/${project.id}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'exports' }),
    })
    if (res.ok) {
      const next = (await res.json()) as BookProject
      setProject(next)
      router.refresh()
    }
    setRefreshingExports(false)
  }

  async function handleGenerateFinalArt() {
    setGeneratingArt(true)
    const res = await fetch(`/api/books/${project.id}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'art' }),
    })
    if (res.ok) {
      const next = (await res.json()) as BookProject
      setProject(next)
      router.refresh()
    }
    setGeneratingArt(false)
  }

  async function handleFinalizeForOrder() {
    setFinalizing(true)
    const res = await fetch(`/api/books/${project.id}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'finalize' }),
    })
    if (res.ok) {
      const next = (await res.json()) as BookProject
      setProject(next)
      router.refresh()
    }
    setFinalizing(false)
  }

  const progress = project.totalSpreads > 0
    ? Math.round((project.completedSpreads / project.totalSpreads) * 100)
    : 0
  const readinessState = getBookReadinessState(project)
  const isActiveBuild = project.status !== 'ready' && project.status !== 'failed'
  const lastUpdated = project.updatedAt
    ? new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(project.updatedAt))
    : null

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
          {lastUpdated ? (
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-night-400">
              {t('updatedLabel', { value: lastUpdated })}
            </p>
          ) : null}
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-night-400">
            {t('versionLabel', { value: project.assets.exportVersion ?? project.assets.proofVersion ?? 0 })}
          </p>
          {project.assets.finalExportVersion ? (
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-night-400">
              {t('finalVersionLabel', { value: project.assets.finalExportVersion })}
            </p>
          ) : null}
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

      {isActiveBuild ? (
        <div className="mt-6 rounded-2xl border border-star-200 bg-star-50 p-4">
          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 h-5 w-5 animate-spin rounded-full border-2 border-star-200 border-t-star-600"
              aria-hidden="true"
            />
            <div>
              <p className="font-bold text-star-800">
                {startingBuild && project.status === 'queued' ? t('startingTitle') : t('activeTitle')}
              </p>
              <p className="mt-1 text-sm text-star-900">
                {startingBuild && project.status === 'queued' ? t('startingSub') : t('activeSub')}
              </p>
              <p className="mt-2 text-xs font-medium uppercase tracking-wide text-star-700">
                {t('safeToLeave')}
              </p>
            </div>
          </div>
        </div>
      ) : null}

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
        <div className={`mt-6 rounded-2xl p-4 ${
          readinessState === 'order_ready'
            ? 'border border-green-200 bg-green-50'
            : readinessState === 'export_ready'
              ? 'border border-sky-200 bg-sky-50'
              : 'border border-amber-200 bg-amber-50'
        }`}>
          <p className={`font-bold ${
            readinessState === 'order_ready'
              ? 'text-green-700'
              : readinessState === 'export_ready'
                ? 'text-sky-800'
                : 'text-amber-800'
          }`}>
            {readinessState === 'order_ready'
              ? t('orderReadyTitle')
              : readinessState === 'export_ready'
                ? t('exportReadyTitle')
                : t('draftReadyTitle')}
          </p>
          <p className={`mt-1 text-sm ${
            readinessState === 'order_ready'
              ? 'text-green-700'
              : readinessState === 'export_ready'
                ? 'text-sky-900'
                : 'text-amber-900'
          }`}>
            {readinessState === 'order_ready'
              ? t('orderReadySub')
              : readinessState === 'export_ready'
                ? t('exportReadySub')
                : t('draftReadySub')}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={handleGenerateFinalArt}
              disabled={generatingArt || finalizing || rebuilding || refreshingExports}
              className="rounded-full border border-night-300 px-4 py-2 text-sm font-bold text-night-700 transition hover:bg-night-50 disabled:opacity-60"
            >
              {generatingArt
                ? t('generatingArtButton')
                : project.assets.artMode === 'generated'
                  ? t('refreshArtButton')
                  : t('generateArtButton')}
            </button>
            <button
              onClick={handleRefreshExports}
              disabled={refreshingExports || rebuilding || finalizing || generatingArt}
              className={`rounded-full px-4 py-2 text-sm font-bold transition disabled:opacity-60 ${
                readinessState === 'order_ready'
                  ? 'border border-green-300 text-green-700 hover:bg-green-100'
                  : readinessState === 'export_ready'
                    ? 'border border-sky-300 text-sky-700 hover:bg-sky-100'
                    : 'border border-amber-300 text-amber-800 hover:bg-amber-100'
              }`}
            >
              {refreshingExports ? t('refreshingExportsButton') : t('refreshExportsButton')}
            </button>
            <button
              onClick={handleRebuild}
              disabled={rebuilding || refreshingExports || finalizing || generatingArt}
              className={`rounded-full px-4 py-2 text-sm font-bold transition disabled:opacity-60 ${
                readinessState === 'order_ready'
                  ? 'bg-green-700 text-white hover:bg-green-600'
                  : readinessState === 'export_ready'
                    ? 'bg-sky-700 text-white hover:bg-sky-600'
                    : 'bg-amber-600 text-white hover:bg-amber-500'
              }`}
            >
              {rebuilding ? t('rebuildingButton') : t('rebuildButton')}
            </button>
            <button
              onClick={handleFinalizeForOrder}
              disabled={finalizing || rebuilding || refreshingExports || generatingArt || readinessState === 'draft_ready'}
              className="rounded-full bg-night-800 px-4 py-2 text-sm font-bold text-white transition hover:bg-night-700 disabled:opacity-60"
            >
              {finalizing ? t('finalizingButton') : readinessState === 'order_ready' ? t('refreshFinalButton') : t('finalizeButton')}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
