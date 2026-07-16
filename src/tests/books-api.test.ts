import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { ChildProfile, Story } from '@/types'
import type { BookProject } from '@/types/printBook'

const mockAuth = vi.fn(async () => ({ userId: 'user-1' }))

const mockDb = {
  stories: {
    getById: vi.fn(),
  },
  profiles: {
    getById: vi.fn(),
  },
  bookBuildJobs: {
    getById: vi.fn(),
    getCurrentByProjectId: vi.fn(),
  },
  bookProjects: {
    getById: vi.fn(),
    getByUserId: vi.fn(),
    create: vi.fn(),
  },
}

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}))

vi.mock('@/lib/db', () => ({
  db: mockDb,
}))

function createStory(): Story {
  return {
    id: 'story-1',
    userId: 'user-1',
    title: 'Moonlight Garden',
    profileId: 'profile-1',
    profileName: 'Mila',
    wordCount: 120,
    theme: 'kindness',
    notes: '',
    createdAt: '2026-07-15T00:00:00.000Z',
    pages: [],
  }
}

function createProfile(): ChildProfile {
  return {
    id: 'profile-1',
    userId: 'user-1',
    name: 'Mila',
    age: 4,
    favouriteCharacters: [],
    favouriteActivities: [],
    favouriteAnimals: [],
    favouritePlaces: [],
    lessons: [],
    createdAt: '2026-07-15T00:00:00.000Z',
  }
}

function createBookProject(): BookProject {
  return {
    id: 'book-1',
    userId: 'user-1',
    sourceStoryId: 'story-1',
    profileId: 'profile-1',
    ageBand: '3-5',
    status: 'queued',
    trimSize: 'lulu-hardcover-32',
    pageCount: 32,
    spreadCount: 16,
    completedSpreads: 0,
    totalSpreads: 16,
    currentStageLabel: 'Dreaming up the adventure...',
    beats: [],
    spreads: [],
    assets: { proofVersion: 0 },
    retryCount: 0,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  }
}

describe('/api/books', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: 'user-1' })
    mockDb.stories.getById.mockResolvedValue(createStory())
    mockDb.profiles.getById.mockResolvedValue(createProfile())
    mockDb.bookBuildJobs.getById.mockResolvedValue(undefined)
    mockDb.bookBuildJobs.getCurrentByProjectId.mockResolvedValue(undefined)
    mockDb.bookProjects.getByUserId.mockResolvedValue([])
    mockDb.bookProjects.create.mockResolvedValue(undefined)
  })

  it('creates a queued book project from a source story', async () => {
    const { POST } = await import('@/app/api/books/route')
    const req = new NextRequest('http://localhost/api/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceStoryId: 'story-1' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.sourceStoryId).toBe('story-1')
    expect(body.status).toBe('queued')
    expect(mockDb.bookProjects.create).toHaveBeenCalledTimes(1)
  })

  it('lists book projects for the current user', async () => {
    const project = createBookProject()
    mockDb.bookProjects.getByUserId.mockResolvedValue([project])

    const { GET } = await import('@/app/api/books/route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([project])
  })
})

describe('/api/books/[id] and /status', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: 'user-1' })
    mockDb.bookBuildJobs.getById.mockResolvedValue(undefined)
    mockDb.bookBuildJobs.getCurrentByProjectId.mockResolvedValue(undefined)
    mockDb.bookProjects.getById.mockResolvedValue(createBookProject())
  })

  it('returns a full book project payload', async () => {
    const { GET } = await import('@/app/api/books/[id]/route')
    const res = await GET(new NextRequest('http://localhost/api/books/book-1'), {
      params: Promise.resolve({ id: 'book-1' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe('book-1')
  })

  it('returns a lightweight status payload', async () => {
    const { GET } = await import('@/app/api/books/[id]/status/route')
    const res = await GET(new NextRequest('http://localhost/api/books/book-1/status'), {
      params: Promise.resolve({ id: 'book-1' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      id: 'book-1',
      status: 'queued',
      completedSpreads: 0,
      totalSpreads: 16,
    })
  })
})
