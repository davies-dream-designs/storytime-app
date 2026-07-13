'use client'

import { useState } from 'react'

const PACKS = [
  { id: 'starter',  label: 'Starter',      stories: 10,  price: '$4.99',  priceNote: 'AUD' },
  { id: 'family',   label: 'Family',        stories: 30,  price: '$11.99', priceNote: 'AUD', popular: true },
  { id: 'pro',      label: 'Bedtime Pro',   stories: 100, price: '$29.99', priceNote: 'AUD' },
] as const

export default function CreditPacks() {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handlePurchase(packId: string) {
    setLoading(packId)
    setError('')
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack: packId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(null)
    }
  }

  return (
    <div className="mt-8">
      <h2 className="font-display text-2xl font-bold text-night-800">Top up credits</h2>
      <p className="mt-1 text-night-400">Pay once, no subscription. Credits never expire.</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {PACKS.map((pack) => (
          <div
            key={pack.id}
            className={`relative rounded-2xl border p-6 ${
              pack.popular ? 'border-moon-400 bg-moon-50' : 'border-night-100 bg-white'
            }`}
          >
            {pack.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-moon-400 px-3 py-0.5 text-xs font-bold text-night-900">
                Most popular
              </span>
            )}
            <p className="font-display text-lg font-bold text-night-700">{pack.label}</p>
            <p className="mt-1 text-night-500">{pack.stories} stories</p>
            <p className="mt-3 font-display text-2xl font-bold text-night-800">
              {pack.price} <span className="text-sm font-normal text-night-400">{pack.priceNote}</span>
            </p>
            <button
              onClick={() => handlePurchase(pack.id)}
              disabled={loading !== null}
              className={`mt-4 w-full rounded-xl py-2.5 text-sm font-bold transition ${
                pack.popular
                  ? 'bg-night-700 text-moon-200 hover:bg-night-600 disabled:opacity-60'
                  : 'bg-night-100 text-night-700 hover:bg-night-200 disabled:opacity-60'
              }`}
            >
              {loading === pack.id ? '…' : `Get ${pack.stories} stories`}
            </button>
          </div>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>
      )}

      <p className="mt-4 text-center text-xs text-night-400">
        Secure payments via Stripe · AUD pricing · Credits never expire
      </p>
    </div>
  )
}
