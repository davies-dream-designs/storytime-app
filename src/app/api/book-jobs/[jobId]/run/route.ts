import { after, NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dispatchBookBuildJob, processBookBuildJob } from '@/lib/print-books/jobs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const job = await db.bookBuildJobs.getById(jobId)
  if (!job) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const providedToken = req.headers.get('x-book-job-token')
  if (!providedToken || providedToken !== job.token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await processBookBuildJob(jobId)

    if (result.shouldContinue) {
      after(async () => {
        const nextJob = await db.bookBuildJobs.getById(jobId)
        if (nextJob && nextJob.status !== 'completed' && nextJob.status !== 'failed') {
          await dispatchBookBuildJob(nextJob)
        }
      })
    }

    return NextResponse.json({
      id: result.job.id,
      status: result.job.status,
      shouldContinue: result.shouldContinue,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown job error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
