'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'

export default function CreatePrintBookButton({ storyId }: { storyId: string }) {
  const t = useTranslations('books')
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        throw new Error(t('createError'))
      }

      const project = (await createRes.json()) as { id: string }
      await fetch(`/api/books/${project.id}/build`, { method: 'POST' })
      router.push(`/books/${project.id}` as string)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('createError'))
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={handleCreate}
        disabled={loading}
        className="rounded-full border border-star-200 bg-star-50 px-4 py-2 text-sm font-bold text-star-700 transition hover:bg-star-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? t('creatingButton') : t('createButton')}
      </button>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  )
}
