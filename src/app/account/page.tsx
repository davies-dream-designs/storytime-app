import { auth, clerkClient } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import CreditPacks from './CreditPacks'
import ShareSection from '@/components/ShareSection'

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { success, canceled } = await searchParams

  const client = await clerkClient()
  const user = await client.users.getUser(userId)
  const isAdmin = user.privateMetadata.isAdmin === true
  const credits = (user.privateMetadata.credits as number | undefined) ?? 3

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-2xl px-5 py-14">
        <h1 className="font-display text-4xl font-bold text-night-800">Your account</h1>
        <p className="mt-2 text-night-500">{user.emailAddresses[0]?.emailAddress}</p>

        {success && (
          <div className="mt-6 rounded-2xl bg-green-50 border border-green-200 px-5 py-4 text-sm font-bold text-green-700">
            ✅ Payment successful — your credits have been added!
          </div>
        )}
        {canceled && (
          <div className="mt-6 rounded-2xl bg-night-50 border border-night-200 px-5 py-4 text-sm text-night-500">
            Payment canceled — no charge was made.
          </div>
        )}

        {/* Credit balance */}
        <div className="mt-10 rounded-3xl border border-night-100 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-moon-100 text-3xl">
              ✨
            </div>
            <div>
              <p className="font-display text-3xl font-bold text-night-800">
                {isAdmin ? '∞' : credits}
              </p>
              <p className="text-night-500">
                {isAdmin
                  ? 'unlimited (admin)'
                  : credits === 1
                  ? 'story credit remaining'
                  : 'story credits remaining'}
              </p>
            </div>
          </div>
          {!isAdmin && credits <= 1 && (
            <p className="mt-4 rounded-xl bg-star-50 px-4 py-3 text-sm font-bold text-star-700">
              {credits === 0
                ? "You're out of credits — grab a pack below to keep going."
                : "You've got 1 credit left — might want to stock up soon."}
            </p>
          )}
        </div>

        {!isAdmin && <CreditPacks />}
        <ShareSection userId={userId} />
      </main>
    </>
  )
}
