'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { useConfirmDialog } from '@/components/ui/useConfirmDialog'

export default function DeleteProfileButton({ profileId }: { profileId: string }) {
  const router = useRouter()
  const t = useTranslations('profiles')
  const [deleting, setDeleting] = useState(false)
  const { confirm, ConfirmDialog } = useConfirmDialog()

  async function handleDelete() {
    const confirmed = await confirm({
      title: t('deleteProfile'),
      message: t('deleteConfirm'),
      confirmLabel: t('deleteProfile'),
      variant: 'danger',
    })
    if (!confirmed) return
    setDeleting(true)
    await fetch(`/api/profiles/${profileId}`, { method: 'DELETE' })
    router.push('/profiles')
  }

  return (
    <>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="rounded-full border border-blush-300 px-5 py-2.5 text-sm font-bold text-blush-500 transition hover:bg-blush-50 disabled:opacity-60"
      >
        {deleting ? t('deleting') : t('deleteProfile')}
      </button>
      <ConfirmDialog />
    </>
  )
}
