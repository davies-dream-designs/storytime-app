'use client'

import { useEffect } from 'react'

// Fires once on dashboard load. If there's a referral cookie, redeems it
// (grants credit to the referrer) then clears the cookie.
export default function ReferralRedeemer() {
  useEffect(() => {
    const match = document.cookie.match(/storycot_ref=([^;]+)/)
    if (!match) return
    const ref = decodeURIComponent(match[1])

    fetch('/api/referral/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref }),
    }).then((res) => {
      if (res.ok || res.status === 409) {
        // clear cookie whether we redeemed or it was already used
        document.cookie = 'storycot_ref=; path=/; max-age=0'
      }
    }).catch(() => { /* silent — will retry on next load */ })
  }, [])

  return null
}
