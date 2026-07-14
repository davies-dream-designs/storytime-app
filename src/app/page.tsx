import Link from 'next/link'
import Image from 'next/image'
import { Suspense } from 'react'
import RefCapture from '@/components/RefCapture'

export default function Home() {
  return (
    <main className="overflow-x-hidden">
      <Suspense><RefCapture /></Suspense>
      {/* Nav */}
      <header className="absolute inset-x-0 top-0 z-30">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link href="/" className="flex items-center gap-2 font-display text-2xl font-bold text-white">
            <Image src="/icon-dark.svg" alt="" width={36} height={36} className="rounded-xl" aria-hidden />
            Storycot
          </Link>
          <Link
            href="/dashboard"
            className="rounded-full bg-moon-400 px-5 py-2.5 text-sm font-bold text-night-900 transition hover:bg-moon-300"
          >
            Open App
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative min-h-screen bg-gradient-to-b from-night-900 via-night-800 to-night-700 flex items-center">
        {/* Stars */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {[
            [15, 12], [35, 8], [55, 18], [72, 5], [88, 14],
            [8, 35], [25, 42], [45, 30], [65, 45], [82, 38],
            [18, 62], [40, 55], [60, 68], [78, 58], [92, 72],
          ].map(([x, y], i) => (
            <div
              key={i}
              className="animate-twinkle absolute h-1 w-1 rounded-full bg-moon-200"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                animationDelay: `${i * 0.3}s`,
                opacity: 0.6 + (i % 3) * 0.15,
              }}
            />
          ))}
        </div>

        {/* Moon */}
        <div className="pointer-events-none absolute right-10 top-16 h-24 w-24 rounded-full bg-moon-200 opacity-20 blur-xl" aria-hidden />
        <div className="pointer-events-none absolute right-12 top-18 h-20 w-20 rounded-full bg-moon-300 opacity-30" aria-hidden />

        <div className="relative mx-auto max-w-5xl px-5 py-32 text-center">
          <div className="animate-drift mb-6 flex justify-center" aria-hidden>
            <Image src="/icon-dark.svg" alt="" width={120} height={120} className="rounded-3xl shadow-2xl shadow-night-900/50" />
          </div>
          <h1 className="font-display text-5xl font-bold leading-tight text-white sm:text-6xl lg:text-7xl">
            Bedtime stories
            <br />
            <span className="text-moon-300">made just for them.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-night-200 sm:text-xl">
            Create personalised, AI-generated bedtime stories starring your child — with their
            favourite toys, animals, and adventures woven into every page.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/dashboard"
              className="rounded-full bg-moon-400 px-8 py-4 text-lg font-bold text-night-900 transition hover:bg-moon-300 hover:scale-105"
            >
              Create your first story ✨
            </Link>
            <Link
              href="/stories"
              className="rounded-full border border-white/20 px-8 py-4 text-lg font-bold text-white transition hover:bg-white/10"
            >
              Browse stories
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <div className="text-center">
          <h2 className="font-display text-4xl font-bold text-night-800">
            A story that&apos;s theirs alone
          </h2>
          <p className="mt-4 text-lg text-night-500">
            Every detail that makes your child unique goes into every story.
          </p>
        </div>
        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: '👶',
              title: 'Child profiles',
              body: 'Tell us about your little one — their name, age, favourite toys, animals, and places.',
            },
            {
              icon: '✨',
              title: 'AI story magic',
              body: 'Claude AI weaves their world into a 700–900 word bedtime story in seconds.',
            },
            {
              icon: '📚',
              title: 'Story library',
              body: 'Every story is saved. Re-read favourites any time, any night.',
            },
            {
              icon: '🖨️',
              title: 'Print as a book',
              body: 'Export any story as a beautiful PDF to print and keep forever.',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-3xl border border-night-100 bg-white p-8 shadow-sm"
            >
              <div className="text-4xl">{f.icon}</div>
              <h3 className="mt-4 font-display text-xl font-bold text-night-700">{f.title}</h3>
              <p className="mt-2 text-night-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Example story structure */}
      <section className="bg-night-800 py-24 text-white">
        <div className="mx-auto max-w-4xl px-5 text-center">
          <h2 className="font-display text-4xl font-bold">Every story has a perfect arc.</h2>
          <p className="mt-4 text-night-200">
            The AI follows a proven structure that keeps kids engaged and ends with calm.
          </p>
          <div className="mt-14 grid grid-cols-5 gap-2 sm:gap-4">
            {[
              { num: '1', label: 'Introduction', icon: '🌅' },
              { num: '2', label: 'Adventure', icon: '🗺️' },
              { num: '3', label: 'Growth', icon: '🌱' },
              { num: '4', label: 'Resolution', icon: '⭐' },
              { num: '5', label: 'Bedtime', icon: '😴' },
            ].map((step) => (
              <div key={step.num} className="flex flex-col items-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-moon-400/20 text-2xl">
                  {step.icon}
                </div>
                <p className="text-xs font-bold text-moon-300 sm:text-sm">{step.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Themes */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <div className="text-center">
          <h2 className="font-display text-4xl font-bold text-night-800">
            Stories with heart.
          </h2>
          <p className="mt-4 text-lg text-night-500">
            Choose a theme and the story naturally teaches it.
          </p>
        </div>
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          {[
            ['💛', 'Kindness'],
            ['🦁', 'Bravery'],
            ['🤝', 'Sharing'],
            ['🌈', 'Trying new things'],
            ['💭', 'Dealing with emotions'],
            ['👫', 'Friendship'],
            ['🌿', 'Patience'],
            ['✅', 'Honesty'],
            ['🙏', 'Gratitude'],
            ['💪', 'Perseverance'],
          ].map(([icon, theme]) => (
            <span
              key={theme}
              className="flex items-center gap-2 rounded-full border border-night-100 bg-white px-5 py-2.5 text-sm font-bold text-night-600 shadow-sm"
            >
              <span>{icon}</span> {theme}
            </span>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-b from-night-700 to-night-900 py-24 text-center">
        <div className="mx-auto max-w-2xl px-5">
          <div className="flex justify-center" aria-hidden>
            <Image src="/icon-dark.svg" alt="" width={80} height={80} className="rounded-2xl" />
          </div>
          <h2 className="mt-4 font-display text-4xl font-bold text-white">
            Ready for tonight&apos;s story?
          </h2>
          <p className="mt-4 text-night-200">
            Create a child profile, pick a theme, and have a magical story ready in under a minute.
          </p>
          <Link
            href="/dashboard"
            className="mt-8 inline-block rounded-full bg-moon-400 px-8 py-4 text-lg font-bold text-night-900 transition hover:bg-moon-300"
          >
            Get started — it&apos;s free ✨
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-night-900 py-8 text-center text-night-300">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Image src="/icon-dark.svg" alt="" width={24} height={24} className="rounded-md" aria-hidden />
          <p className="font-display text-lg font-bold text-white">Storycot</p>
        </div>
        <p className="text-sm">Personalised bedtime stories for the little ones you love.</p>
      </footer>
    </main>
  )
}
