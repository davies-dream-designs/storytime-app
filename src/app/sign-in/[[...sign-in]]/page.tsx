import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-night-900 to-night-800 px-5">
      <div className="text-center">
        <div className="mb-6 font-display text-3xl font-bold text-white">
          <span aria-hidden>🌙</span> Storycot
        </div>
        <SignIn />
      </div>
    </div>
  )
}
