'use client'

export default function PrintTrigger({ storyId }: { storyId: string }) {
  return (
    <div className="no-print fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 gap-3">
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
  )
}
