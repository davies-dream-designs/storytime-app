'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

export default function ShareButton({ storyId }: { storyId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'copied'>('idle')
  const t = useTranslations('stories')

  async function handleShare() {
    setState('loading')
    try {
      const res = await fetch(`/api/stories/${storyId}/share`, { method: 'POST' })
      const { token } = await res.json()
      const url = `${window.location.origin}/s/${token}`
      await navigator.clipboard.writeText(url)
      setState('copied')
      setTimeout(() => setState('idle'), 2500)
    } catch {
      setState('idle')
    }
  }

  return (
    <button
      onClick={handleShare}
      disabled={state === 'loading'}
      className="rounded-full border border-night-200 px-4 py-2 text-sm font-bold text-night-600 transition hover:bg-night-50 disabled:opacity-60"
    >
      {state === 'copied' ? t('shareLinkCopied') : state === 'loading' ? '…' : t('shareIdle')}
    </button>
  )
}
