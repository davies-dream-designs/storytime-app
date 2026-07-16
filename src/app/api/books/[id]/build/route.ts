import { after, NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { dispatchBookBuildJob, enqueueBookBuildJob } from '@/lib/print-books/jobs'
import type { BookBuildMode } from '@/types/printBook'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const project = await db.bookProjects.getById(id)
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const payload = (await req.json().catch(() => null)) as { mode?: BookBuildMode } | null
  const buildMode: BookBuildMode =
    payload?.mode === 'exports'
      ? 'exports'
      : payload?.mode === 'finalize'
        ? 'finalize'
        : payload?.mode === 'art'
          ? 'art'
          : 'full'

  try {
    const { job, project: queuedProject } = await enqueueBookBuildJob({
      project,
      mode: buildMode,
      baseUrl: req.nextUrl.origin,
    })

    after(async () => {
      await dispatchBookBuildJob(job)
    })

    return NextResponse.json(queuedProject)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown build error'
    const status = /already running|complete draft|OPENAI_API_KEY/i.test(message) ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
