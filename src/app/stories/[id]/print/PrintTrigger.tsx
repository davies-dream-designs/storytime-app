'use client'

export default function PrintTrigger({ storyId }: { storyId: string }) {
  return (
    <div className="no-print fixed bottom-6 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 flex-col items-center gap-2">
      <p className="rounded-full bg-black/60 px-4 py-1.5 text-center text-xs text-white/70">
        Best results: paper size <strong className="text-white">A4</strong>, margins <strong className="text-white">None</strong>
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => window.print()}
          className="rounded-full bg-moon-400 px-6 py-3 font-bold text-night-900 shadow-lg transition hover:bg-moon-300"
        >
          🖨️ Print / Save as PDF
        </button>
        <a
          href={`/stories/${storyId}`}
          className="rounded-full border border-white/30 bg-night-700 px-6 py-3 font-bold text-white shadow-lg transition hover:bg-night-600"
        >
          ← Back
        </a>
      </div>
    </div>
  )
}
