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
  bookProjects: {
    getById: vi.fn(),
    update: vi.fn(),
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
    pages: Array.from({ length: 6 }, (_, index) => ({
      pageNumber: index + 1,
      text: `Story page ${index + 1} with a quiet bedtime moment.`,
      illustrationPrompt: `Illustration prompt ${index + 1}`,
    })),
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

describe('POST /api/books/[id]/build', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: 'user-1' })
    mockDb.bookProjects.getById.mockResolvedValue(createBookProject())
    mockDb.stories.getById.mockResolvedValue(createStory())
    mockDb.profiles.getById.mockResolvedValue(createProfile())
    mockDb.bookProjects.update.mockImplementation(async (_id: string, updates: Partial<BookProject>) => ({
      ...createBookProject(),
      ...updates,
    }))
  })

  it('runs the planning-only build flow and returns a ready project', async () => {
    const { POST } = await import('@/app/api/books/[id]/build/route')
    const res = await POST(new NextRequest('http://localhost/api/books/book-1/build', { method: 'POST' }), {
      params: Promise.resolve({ id: 'book-1' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ready')
    expect(mockDb.bookProjects.update).toHaveBeenCalledTimes(3)
  })
})
