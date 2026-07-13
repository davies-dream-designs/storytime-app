import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import PrintTrigger from './PrintTrigger'

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const story = db.stories.getById(id)
  if (!story) notFound()

  const dateStr = new Date(story.createdAt).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <>
      <PrintTrigger />
      <style>{`
        @media print {
          @page { margin: 15mm; size: A4; }
          body { font-family: 'Nunito', Georgia, serif; }
        }
      `}</style>

      {/* Cover page */}
      <div className="print-cover flex min-h-screen flex-col items-center justify-center bg-night-800 p-10 text-center text-white">
        <div className="text-6xl" aria-hidden>🌙</div>
        <h1 className="mt-6 font-display text-4xl font-bold text-moon-200 sm:text-5xl">
          {story.title}
        </h1>
        <div className="mt-8 h-px w-32 bg-moon-400 opacity-50" />
        <p className="mt-8 text-xl text-night-200">
          Created especially for{' '}
          <span className="font-bold text-moon-300">{story.profileName}</span>
        </p>
        <p className="mt-2 text-night-400">{dateStr}</p>
        <div className="mt-8 text-5xl" aria-hidden>⭐</div>
        <p className="mt-4 text-sm text-night-400">A Storytime story</p>

        <div className="no-print mt-12 flex gap-4">
          <button
            onClick={() => window.print()}
            className="rounded-full bg-moon-400 px-6 py-3 font-bold text-night-900"
          >
            🖨️ Print / Save as PDF
          </button>
          <a
            href={`/stories/${id}`}
            className="rounded-full border border-white/30 px-6 py-3 font-bold text-white"
          >
            ← Back to story
          </a>
        </div>
      </div>

      {/* Story pages */}
      {story.pages.map((p, i) => (
        <div
          key={i}
          className="print-page flex min-h-screen flex-col bg-parchment p-10 sm:p-14"
        >
          {/* Illustration placeholder */}
          <div className="mb-8 flex h-56 items-center justify-center rounded-2xl border-2 border-dashed border-night-200 bg-white">
            <div className="text-center">
              <div className="text-3xl" aria-hidden>🎨</div>
              <p className="mt-2 max-w-xs text-xs text-night-300">{p.illustrationPrompt}</p>
            </div>
          </div>

          {/* Story text */}
          <div className="flex-1">
            <p className="font-display text-xl font-medium leading-relaxed text-night-800 sm:text-2xl">
              {p.text}
            </p>
          </div>

          {/* Page number */}
          <div className="mt-8 flex items-center justify-between border-t border-night-100 pt-4">
            <p className="text-xs font-bold text-night-300">{story.title}</p>
            <p className="text-xs text-night-300">
              {i + 1} / {story.pages.length}
            </p>
          </div>
        </div>
      ))}

      {/* Back end page */}
      <div className="print-page flex min-h-screen flex-col items-center justify-center bg-night-800 p-10 text-center text-white">
        <div className="text-5xl" aria-hidden>😴</div>
        <p className="mt-6 font-display text-2xl font-bold text-moon-200">
          The end.
        </p>
        <p className="mt-4 text-night-300">
          Sweet dreams, {story.profileName}. 🌙
        </p>
      </div>
    </>
  )
}
