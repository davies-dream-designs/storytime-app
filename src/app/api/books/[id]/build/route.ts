import { after, NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { dispatchBookBuildJob, enqueueBookBuildJob } from '@/lib/print-books/jobs'
import { inngest, INNGEST_EVENTS } from '@/lib/inngest/client'
import type { BookBuildMode } from '@/types/printBook'

// Opt-in switch: set BOOK_PIPELINE_DRIVER=inngest to run builds through the
// durable Inngest queue. Defaults to the in-process after() continuation so
// nothing changes until Inngest is wired up and validated.
const useInngestPipeline = process.env.BOOK_PIPELINE_DRIVER === 'inngest'

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

    if (useInngestPipeline) {
      await inngest.send({ name: INNGEST_EVENTS.bookBuildRequested, data: { jobId: job.id } })
    } else {
      after(async () => {
        await dispatchBookBuildJob(job)
      })
    }

    return NextResponse.json(queuedProject)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown build error'
    const status = /insufficient credits/i.test(message)
      ? 402
      : /already running|complete draft|OPENAI_API_KEY/i.test(message)
        ? 409
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}
