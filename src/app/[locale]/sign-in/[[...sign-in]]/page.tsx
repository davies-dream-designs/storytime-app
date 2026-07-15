import Image from 'next/image'
import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-night-900 to-night-800 px-5">
      <div className="text-center">
        <div className="mb-6 flex items-center justify-center gap-3 font-display text-3xl font-bold text-white">
          <Image src="/icon-dark.svg" alt="" width={40} height={40} className="rounded-xl" aria-hidden />
          <span>Storycot</span>
        </div>
        <SignIn />
      </div>
    </div>
  )
}
