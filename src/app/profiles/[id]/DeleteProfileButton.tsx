'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function DeleteProfileButton({ profileId }: { profileId: string }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm('Delete this profile? Stories will not be deleted.')) return
    setDeleting(true)
    await fetch(`/api/profiles/${profileId}`, { method: 'DELETE' })
    router.push('/profiles')
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="rounded-full border border-blush-300 px-5 py-2.5 text-sm font-bold text-blush-500 transition hover:bg-blush-50 disabled:opacity-60"
    >
      {deleting ? 'Deleting…' : 'Delete'}
    </button>
  )
}
