import { notFound, redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import EditProfileForm from './EditProfileForm'

export default async function EditProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const { id } = await params
  const profile = await db.profiles.getById(id)
  if (!profile || profile.userId !== userId) notFound()
  return <EditProfileForm profile={profile} />
}
