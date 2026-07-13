import { auth, clerkClient } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'

export default async function AccountPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const client = await clerkClient()
  const user = await client.users.getUser(userId)
  const credits = (user.privateMetadata.credits as number | undefined) ?? 3

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-2xl px-5 py-14">
        <h1 className="font-display text-4xl font-bold text-night-800">Your account</h1>
        <p className="mt-2 text-night-500">{user.emailAddresses[0]?.emailAddress}</p>

        {/* Credit balance */}
        <div className="mt-10 rounded-3xl border border-night-100 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-moon-100 text-3xl">
              ✨
            </div>
            <div>
              <p className="font-display text-3xl font-bold text-night-800">{credits}</p>
              <p className="text-night-500">
                {credits === 1 ? 'story credit remaining' : 'story credits remaining'}
              </p>
            </div>
          </div>
          {credits <= 1 && (
            <p className="mt-4 rounded-xl bg-star-50 px-4 py-3 text-sm font-bold text-star-700">
              {credits === 0
                ? 'You\'re out of credits — grab a pack below to keep going.'
                : 'You\'ve got 1 credit left — might want to stock up soon.'}
            </p>
          )}
        </div>

        {/* Credit packs — Stripe coming soon */}
        <div className="mt-8">
          <h2 className="font-display text-2xl font-bold text-night-800">Top up credits</h2>
          <p className="mt-1 text-night-400">Pay once, no subscription. Credits never expire.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {[
              { label: 'Starter', stories: 10, price: '$4.99' },
              { label: 'Family', stories: 30, price: '$11.99', popular: true },
              { label: 'Bedtime Pro', stories: 100, price: '$29.99' },
            ].map((pack) => (
              <div
                key={pack.label}
                className={`relative rounded-2xl border p-6 ${
                  pack.popular
                    ? 'border-moon-400 bg-moon-50'
                    : 'border-night-100 bg-white'
                }`}
              >
                {pack.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-moon-400 px-3 py-0.5 text-xs font-bold text-night-900">
                    Most popular
                  </span>
                )}
                <p className="font-display text-lg font-bold text-night-700">{pack.label}</p>
                <p className="mt-1 text-night-500">{pack.stories} stories</p>
                <p className="mt-3 font-display text-2xl font-bold text-night-800">{pack.price}</p>
                <button
                  disabled
                  className="mt-4 w-full cursor-not-allowed rounded-xl bg-night-100 py-2.5 text-sm font-bold text-night-400"
                >
                  Coming soon
                </button>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-sm text-night-400">
            Payments via Stripe — launching very soon.
          </p>
        </div>
      </main>
    </>
  )
}
