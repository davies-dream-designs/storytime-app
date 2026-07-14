'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

// Silently stores ?ref= in a cookie when someone lands via a referral link.
// No render output.
export default function RefCapture() {
  const params = useSearchParams()
  useEffect(() => {
    const ref = params.get('ref')
    if (ref && /^user_[A-Za-z0-9]+$/.test(ref)) {
      document.cookie = `storycot_ref=${ref}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`
    }
  }, [params])
  return null
}
