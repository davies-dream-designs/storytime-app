'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

export default function ShareSection({ userId }: { userId: string }) {
  const [copied, setCopied] = useState(false)
  const t = useTranslations('account')
  const link = `https://storycot.com?ref=${userId}`

  function copy() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  return (
    <div className="mt-8 rounded-3xl border border-star-200 bg-star-50 p-8">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-star-100 text-2xl">
          🎁
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-xl font-bold text-night-800">{t('shareReferralTitle')}</h2>
          <p className="mt-1 text-sm text-night-500">{t('shareReferralSub')}</p>
          <div className="mt-4 flex gap-2">
            <input
              readOnly
              value={link}
              className="min-w-0 flex-1 rounded-xl border border-star-200 bg-white px-4 py-2.5 text-sm text-night-600 outline-none"
            />
            <button
              onClick={copy}
              className={`flex-shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                copied
                  ? 'bg-green-500 text-white'
                  : 'bg-night-700 text-moon-200 hover:bg-night-600'
              }`}
            >
              {copied ? t('shareLinkCopied') : t('shareCopyLink')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
