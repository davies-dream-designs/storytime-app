import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { ChildProfile, Story } from '@/types'
import type { BookProject, CharacterBible } from '@/types/printBook'

const mockAuth = vi.fn(async () => ({ userId: 'user-1' }))
const mockGenerateCharacterBible = vi.fn()
const mockGenerateCoverIllustration = vi.fn()
const mockGenerateSpreadIllustration = vi.fn()
const mockGenerateBookPdfs = vi.fn()

const mockDb = {
  stories: {
    getById: vi.fn(),
  },
  profiles: {
    getById: vi.fn(),
  },
  characters: {
    getByProfileId: vi.fn(),
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

vi.mock('@/lib/print-books/characterBible', async () => {
  const actual = await vi.importActual<typeof import('@/lib/print-books/characterBible')>(
    '@/lib/print-books/characterBible'
  )

  return {
    ...actual,
    generateCharacterBible: mockGenerateCharacterBible,
  }
})

vi.mock('@/lib/print-books/illustrations', () => ({
  generateCoverIllustration: mockGenerateCoverIllustration,
  generateSpreadIllustration: mockGenerateSpreadIllustration,
  applySpreadIllustration: (spreads: BookProject['spreads'], nextSpread: BookProject['spreads'][number]) =>
    spreads.map((spread) => (spread.id === nextSpread.id ? nextSpread : spread)),
}))

vi.mock('@/lib/print-books/pdf', () => ({
  generateBookPdfs: mockGenerateBookPdfs,
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

function createCharacterBible(): CharacterBible {
  return {
    childAppearance: 'Mila has curly dark hair and round cheeks.',
    outfitRules: 'Keep Mila in a yellow cardigan and blue pajamas.',
    recurringProps: ['silver lantern'],
    companionCharacters: ['sleepy fox'],
    palette: 'soft indigo, moonlit silver, warm butter yellow',
    renderStyle: 'storybook gouache with gentle texture',
    lightingTone: 'soft moonlight with warm window glow',
    doNotChange: ['curly dark hair', 'yellow cardigan', 'silver lantern'],
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
    mockDb.characters.getByProfileId.mockResolvedValue([])
    mockDb.bookProjects.update.mockImplementation(async (_id: string, updates: Partial<BookProject>) => ({
      ...createBookProject(),
      ...updates,
    }))
    mockGenerateCharacterBible.mockResolvedValue(createCharacterBible())
    mockGenerateCoverIllustration.mockImplementation(async ({ project }: { project: BookProject }) => ({
      coverImageUrl: 'https://example.com/books/book-1/cover.svg',
      spreads: project.spreads.map((spread, index) =>
        index === 0
          ? {
              ...spread,
              imageUrl: 'https://example.com/books/book-1/cover.svg',
              thumbnailUrl: 'https://example.com/books/book-1/cover.svg',
            }
          : spread
      ),
      provider: 'placeholder',
    }))
    mockGenerateSpreadIllustration.mockImplementation(async ({ spread }: { spread: BookProject['spreads'][number] }) => ({
      spread: {
        ...spread,
        imageUrl: `https://example.com/books/book-1/spreads/${spread.sequence}.svg`,
        thumbnailUrl: `https://example.com/books/book-1/spreads/${spread.sequence}.svg`,
      },
      provider: 'placeholder',
    }))
    mockGenerateBookPdfs.mockResolvedValue({
      coverPdfUrl: 'https://example.com/books/book-1/cover.pdf',
      coverPdfReadyForOrdering: false,
      previewPdfUrl: 'https://example.com/books/book-1/preview.pdf',
      printPdfUrl: 'https://example.com/books/book-1/print.pdf',
      previewImages: ['https://example.com/books/book-1/cover.svg'],
    })
  })

  it('builds a character bible, generates a cover, and returns a ready project with proofing issues surfaced', async () => {
    const { POST } = await import('@/app/api/books/[id]/build/route')
    const res = await POST(new NextRequest('http://localhost/api/books/book-1/build', { method: 'POST' }), {
      params: Promise.resolve({ id: 'book-1' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ready')
    expect(mockGenerateCharacterBible).toHaveBeenCalledTimes(1)
    expect(mockGenerateCoverIllustration).toHaveBeenCalledTimes(1)
    expect(mockGenerateSpreadIllustration).toHaveBeenCalledTimes(15)
    expect(mockGenerateBookPdfs).toHaveBeenCalledTimes(1)
    expect(mockDb.bookProjects.update).toHaveBeenCalledTimes(22)
    expect(mockDb.bookProjects.update).toHaveBeenNthCalledWith(
      2,
      'book-1',
      expect.objectContaining({
        status: 'bible',
        currentStageLabel: 'Sketching your little hero...',
        beats: expect.any(Array),
      })
    )
    expect(mockDb.bookProjects.update).toHaveBeenNthCalledWith(
      3,
      'book-1',
      expect.objectContaining({
        status: 'illustrating',
        characterBible: createCharacterBible(),
        spreads: expect.any(Array),
      })
    )
    expect(mockDb.bookProjects.update).toHaveBeenNthCalledWith(
      4,
      'book-1',
      expect.objectContaining({
        status: 'illustrating',
        completedSpreads: 1,
        totalSpreads: 16,
        assets: expect.objectContaining({
          coverImageUrl: 'https://example.com/books/book-1/cover.svg',
        }),
      })
    )
    expect(mockDb.bookProjects.update).toHaveBeenNthCalledWith(
      20,
      'book-1',
      expect.objectContaining({
        status: 'composing',
        characterBible: createCharacterBible(),
        assets: expect.objectContaining({
          coverImageUrl: 'https://example.com/books/book-1/cover.svg',
        }),
        completedSpreads: 16,
        totalSpreads: 16,
        spreads: expect.any(Array),
      })
    )
    expect(mockDb.bookProjects.update).toHaveBeenNthCalledWith(
      21,
      'book-1',
      expect.objectContaining({
        status: 'proofing',
        assets: expect.objectContaining({
          exportProfile: 'Lulu Square Hardcover 8.5x8.5',
          coverPdfUrl: 'https://example.com/books/book-1/cover.pdf',
          previewPdfUrl: 'https://example.com/books/book-1/preview.pdf',
          printPdfUrl: 'https://example.com/books/book-1/print.pdf',
          proofingPassed: false,
          proofingWarnings: expect.any(Array),
          proofingErrors: expect.any(Array),
        }),
      })
    )
    expect(body.assets?.coverImageUrl).toBe('https://example.com/books/book-1/cover.svg')
    expect(body.assets?.coverPdfUrl).toBe('https://example.com/books/book-1/cover.pdf')
    expect(body.assets?.previewPdfUrl).toBe('https://example.com/books/book-1/preview.pdf')
    expect(body.assets?.printPdfUrl).toBe('https://example.com/books/book-1/print.pdf')
    expect(body.assets?.proofingPassed).toBe(false)
    expect(body.assets?.proofingErrors).toContain(
      'Cover PDF still uses a generic spine width and must be replaced with a Lulu template-matched cover before ordering.'
    )
  })
})
