'use client'

import { useTranslations } from 'next-intl'

export default function PrintTrigger({ storyId }: { storyId: string }) {
  const t = useTranslations('print')
  return (
    <div className="no-print fixed bottom-6 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 flex-col items-center gap-2">
      <p className="rounded-full bg-black/60 px-4 py-1.5 text-center text-xs text-white/70">
        {t('bestResults')}
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => window.print()}
          className="rounded-full bg-moon-400 px-6 py-3 font-bold text-night-900 shadow-lg transition hover:bg-moon-300"
        >
          🖨️ {t('printButton')}
        </button>
        <a
          href={`/stories/${storyId}`}
          className="rounded-full bg-white px-6 py-3 font-bold text-night-800 shadow-lg transition hover:bg-night-50"
        >
          {t('back')}
        </a>
      </div>
    </div>
  )
}
