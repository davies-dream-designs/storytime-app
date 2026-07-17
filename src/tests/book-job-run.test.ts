import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { BookBuildJob } from '@/types/printBook'

const {
  mockAfter,
  mockDispatchBookBuildJob,
  mockProcessBookBuildJob,
} = vi.hoisted(() => ({
  mockAfter: vi.fn(async (callback: () => Promise<void> | void) => {
    await callback()
  }),
  mockDispatchBookBuildJob: vi.fn(),
  mockProcessBookBuildJob: vi.fn(),
}))

const mockDb = {
  bookBuildJobs: {
    getById: vi.fn(),
  },
}

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return {
    ...actual,
    after: mockAfter,
  }
})

vi.mock('@/lib/db', () => ({
  db: mockDb,
}))

vi.mock('@/lib/print-books/jobs', () => ({
  dispatchBookBuildJob: mockDispatchBookBuildJob,
  processBookBuildJob: mockProcessBookBuildJob,
}))

function createJob(status: BookBuildJob['status'] = 'queued'): BookBuildJob {
  return {
    id: 'job-1',
    projectId: 'book-1',
    userId: 'user-1',
    mode: 'art',
    status,
    step: 0,
    token: 'job-token',
    baseUrl: 'http://localhost',
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
  }
}

describe('POST /api/book-jobs/[jobId]/run', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockDb.bookBuildJobs.getById.mockResolvedValue(createJob())
  })

  it('processes a job and continues it when more work remains', async () => {
    mockProcessBookBuildJob.mockResolvedValue({
      job: {
        ...createJob('running'),
        status: 'running',
        step: 1,
      },
      shouldContinue: true,
    })
    mockDb.bookBuildJobs.getById.mockResolvedValueOnce(createJob()).mockResolvedValueOnce({
      ...createJob('running'),
      status: 'running',
      step: 1,
    })

    const { POST } = await import('@/app/api/book-jobs/[jobId]/run/route')
    const res = await POST(
      new NextRequest('http://localhost/api/book-jobs/job-1/run', {
        method: 'POST',
        headers: { 'x-book-job-token': 'job-token' },
      }),
      { params: Promise.resolve({ jobId: 'job-1' }) },
    )

    expect(res.status).toBe(200)
    expect(mockProcessBookBuildJob).toHaveBeenCalledWith('job-1')
    expect(mockDispatchBookBuildJob).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1' }))
  })

  it('does not continue a terminal job', async () => {
    mockProcessBookBuildJob.mockResolvedValue({
      job: {
        ...createJob('completed'),
        status: 'completed',
        step: 4,
      },
      shouldContinue: false,
    })

    const { POST } = await import('@/app/api/book-jobs/[jobId]/run/route')
    const res = await POST(
      new NextRequest('http://localhost/api/book-jobs/job-1/run', {
        method: 'POST',
        headers: { 'x-book-job-token': 'job-token' },
      }),
      { params: Promise.resolve({ jobId: 'job-1' }) },
    )

    expect(res.status).toBe(200)
    expect(mockDispatchBookBuildJob).not.toHaveBeenCalled()
  })

  it('rejects invalid tokens', async () => {
    const { POST } = await import('@/app/api/book-jobs/[jobId]/run/route')
    const res = await POST(
      new NextRequest('http://localhost/api/book-jobs/job-1/run', {
        method: 'POST',
        headers: { 'x-book-job-token': 'wrong-token' },
      }),
      { params: Promise.resolve({ jobId: 'job-1' }) },
    )

    expect(res.status).toBe(401)
    expect(mockProcessBookBuildJob).not.toHaveBeenCalled()
  })
})
