'use client'

import { useEffect } from 'react'

export default function PrintTrigger() {
  useEffect(() => {
    const timeout = setTimeout(() => {
      // Don't auto-print; let user initiate
    }, 500)
    return () => clearTimeout(timeout)
  }, [])

  return null
}
