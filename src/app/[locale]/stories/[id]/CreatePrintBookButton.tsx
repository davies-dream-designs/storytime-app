'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'

export default function CreatePrintBookButton({ storyId }: { storyId: string }) {
  const t = useTranslations('books')
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function getErrorMessage(res: Response, fallback: string): Promise<string> {
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      return data?.error ?? fallback
    }

    const text = await res.text().catch(() => '')
    if (text.includes('<')) return fallback
    return text || fallback
  }

  async function handleCreate() {
    setLoading(true)
    setError(null)

    try {
      const createRes = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceStoryId: storyId }),
      })

      if (!createRes.ok) {
        throw new Error(await getErrorMessage(createRes, t('createError')))
      }

      const project = (await createRes.json()) as { id: string }
      await new Promise((resolve) => window.setTimeout(resolve, 250))
      const buildRes = await fetch(`/api/books/${project.id}/build`, { method: 'POST' })
      if (!buildRes.ok) {
        throw new Error(await getErrorMessage(buildRes, t('buildError')))
      }
      router.push(`/books/${project.id}` as string)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('createError'))
      setLoading(false)
    }
  }

  return (
    <div className={error ? 'basis-full sm:basis-auto' : ''}>
      <button
        onClick={handleCreate}
        disabled={loading}
        className={`rounded-full border border-star-200 bg-star-50 px-4 py-2 text-sm font-bold text-star-700 transition hover:bg-star-100 disabled:cursor-not-allowed disabled:opacity-60 ${
          error ? 'w-full sm:w-auto' : ''
        }`}
      >
        {loading ? t('creatingButton') : t('createButton')}
      </button>
      {error ? (
        <div className="mt-3 max-w-md rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:max-w-sm">
          <p className="font-bold">{t('createErrorTitle')}</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : null}
    </div>
  )
}
