import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { enqueueBookBuildJob } from '@/lib/print-books/jobs'
import { hasUnresolvedGeneratedBookPageImages } from '@/lib/print-books/readiness'
import { inngest, INNGEST_EVENTS } from '@/lib/inngest/client'
import type { BookBuildMode } from '@/types/printBook'

function parseExplicitBuildMode(mode?: BookBuildMode): BookBuildMode | null {
  if (mode === 'exports' || mode === 'finalize' || mode === 'art' || mode === 'full') {
    return mode
  }
  return null
}

function getDefaultBuildMode(project: Awaited<ReturnType<typeof db.bookProjects.getById>>): BookBuildMode {
  if (!project) return 'full'
  if (
    project.status === 'ready' ||
    project.status === 'proofing' ||
    (project.errorCode === 'illustrating:image_failed' &&
      !hasUnresolvedGeneratedBookPageImages(project.spreads))
  ) {
    return 'exports'
  }
  return 'full'
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const project = await db.bookProjects.getById(id)
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const payload = (await req.json().catch(() => null)) as { mode?: BookBuildMode } | null
  const explicitMode = parseExplicitBuildMode(payload?.mode)
  const buildMode = explicitMode ?? getDefaultBuildMode(project)

  if (
    !explicitMode &&
    project.errorCode === 'illustrating:image_failed' &&
    hasUnresolvedGeneratedBookPageImages(project.spreads)
  ) {
    return NextResponse.json(
      { error: 'Retry only the failed image from the spread review.' },
      { status: 409 }
    )
  }

  try {
    const { job, project: queuedProject } = await enqueueBookBuildJob({
      project,
      mode: buildMode,
      baseUrl: req.nextUrl.origin,
    })

    await inngest.send({ name: INNGEST_EVENTS.bookBuildRequested, data: { jobId: job.id } })

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
