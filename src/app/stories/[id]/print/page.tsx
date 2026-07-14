import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import PrintTrigger from './PrintTrigger'

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  const { id } = await params
  const story = await db.stories.getById(id)
  if (!story || story.userId !== userId) notFound()

  const dateStr = new Date(story.createdAt).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <>
      <PrintTrigger storyId={id} />
      <style>{`
        @media print {
          @page { margin: 0; size: A4 portrait; }
          html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .storycot-page { break-after: page; page-break-after: always; min-height: 0 !important; height: 297mm; overflow: hidden; }
        }
        .storycot-page { min-height: 100vh; }
      `}</style>

      {/* Cover */}
      <div className="storycot-page flex flex-col items-center justify-center bg-night-800 p-12 text-center text-white">
        <div className="text-7xl" aria-hidden>🌙</div>
        <h1 className="mt-8 font-display text-5xl font-bold leading-tight text-moon-200">
          {story.title}
        </h1>
        <div className="mt-8 h-px w-40 bg-moon-400/50" />
        <p className="mt-8 text-xl text-night-200">
          A story created especially for{' '}
          <span className="font-bold text-moon-300">{story.profileName}</span>
        </p>
        <p className="mt-2 text-sm text-night-500">{dateStr}</p>
        <p className="mt-12 text-xs text-night-600">A Storycot story · storycot.com</p>
      </div>

      {/* Chapter-style opening page */}
      <div className="storycot-page flex flex-col justify-center bg-parchment px-16 py-16">
        <div className="mb-12 border-b border-night-200 pb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-night-300">A Storycot story</p>
          <h2 className="mt-3 font-display text-4xl font-bold text-night-800">{story.title}</h2>
          <p className="mt-2 text-night-400">For {story.profileName} · {story.theme}</p>
        </div>
        {story.pages.slice(0, 2).map((p, i) => (
          <p key={i} className="mb-6 font-display text-xl leading-relaxed text-night-800">
            {p.text}
          </p>
        ))}
        <p className="mt-auto text-right text-xs text-night-300">1</p>
      </div>

      {/* Remaining pages — 2 pages of text per printed sheet */}
      {Array.from({ length: Math.ceil((story.pages.length - 2) / 2) }, (_, sheetIdx) => {
        const startIdx = 2 + sheetIdx * 2
        const pagePair = story.pages.slice(startIdx, startIdx + 2)
        return (
          <div key={sheetIdx} className="storycot-page flex flex-col justify-center bg-parchment px-16 py-16">
            {pagePair.map((p, i) => (
              <p key={i} className="mb-6 font-display text-xl leading-relaxed text-night-800">
                {p.text}
              </p>
            ))}
            <p className="mt-auto text-right text-xs text-night-300">{sheetIdx + 2}</p>
          </div>
        )
      })}

      {/* Back cover */}
      <div className="storycot-page flex flex-col items-center justify-center bg-night-800 p-12 text-center text-white">
        <div className="text-6xl" aria-hidden>😴</div>
        <p className="mt-8 font-display text-3xl font-bold text-moon-200">The End.</p>
        <p className="mt-4 text-lg text-night-300">
          Sweet dreams, {story.profileName}. 🌙
        </p>
        <div className="mt-16 text-xs text-night-600">
          <p>Created with Storycot · storycot.com</p>
          <p className="mt-1">Every child deserves a story made just for them.</p>
        </div>
      </div>
    </>
  )
}
