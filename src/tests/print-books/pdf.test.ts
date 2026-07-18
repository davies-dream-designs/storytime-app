import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChildProfile, Story } from '@/types'
import type { BookProject, CharacterBible } from '@/types/printBook'

const mockStoreBookAsset = vi.fn()

vi.mock('@/lib/print-books/storage', () => ({
  storeBookAsset: mockStoreBookAsset,
}))

function createProfile(): ChildProfile {
  return {
    id: 'profile-1',
    userId: 'user-1',
    name: 'Mila',
    age: 4,
    favouriteCharacters: ['Bunny'],
    favouriteActivities: ['painting'],
    favouriteAnimals: ['fox'],
    favouritePlaces: ['garden'],
    lessons: ['kindness'],
    createdAt: '2026-07-15T00:00:00.000Z',
  }
}

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
    pages: [
      {
        pageNumber: 1,
        text: 'Mila stepped into the moonlight garden.',
        illustrationPrompt: 'A magical moonlight garden.',
      },
    ],
  }
}

function createCharacterBible(): CharacterBible {
  return {
    childAppearance: 'Mila has curly dark hair and bright brown eyes.',
    outfitRules: 'Keep Mila in a yellow cardigan over blue pajamas.',
    recurringProps: ['silver lantern'],
    companionCharacters: ['sleepy fox'],
    palette: 'soft indigo, butter yellow, silver',
    renderStyle: 'storybook gouache',
    lightingTone: 'cozy moonlight',
    doNotChange: ['curly dark hair', 'yellow cardigan'],
  }
}

function createProject(): BookProject {
  return {
    id: 'book-1',
    userId: 'user-1',
    sourceStoryId: 'story-1',
    profileId: 'profile-1',
    ageBand: '3-5',
    status: 'composing',
    trimSize: 'storycot-dynamic-square',
    pageCount: 32,
    spreadCount: 16,
    completedSpreads: 16,
    totalSpreads: 16,
    currentStageLabel: 'Weaving the story into a real book...',
    characterBible: createCharacterBible(),
    beats: [],
    spreads: [
      {
        id: 'book-1:spread:1',
        bookProjectId: 'book-1',
        sequence: 1,
        pageStart: 1,
        pageEnd: 2,
        layoutType: 'front_matter',
        title: 'Cover',
        leftPageText: 'Moonlight Garden',
        rightPageText: '',
        sceneBrief: 'Front cover for Moonlight Garden',
        illustrationPrompt: 'A magical print-ready picture-book cover for "Moonlight Garden" starring Mila.',
        imageUrl: 'data:image/svg+xml;base64,cover',
      },
      {
        id: 'book-1:spread:2',
        bookProjectId: 'book-1',
        sequence: 2,
        pageStart: 3,
        pageEnd: 4,
        layoutType: 'text_art',
        leftPageText: 'Mila stepped into the moonlight garden.',
        rightPageText: 'The silver lantern glowed softly.',
        sceneBrief: 'The first moment in the garden',
        illustrationPrompt: 'A moonlit path with Mila and the lantern.',
        imageUrl: 'data:image/svg+xml;base64,spread',
      },
    ],
    assets: { proofVersion: 0, coverImageUrl: 'data:image/svg+xml;base64,cover' },
    retryCount: 0,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  }
}

describe('generateBookPdfs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.STORYCOT_COVER_SPINE_WIDTH_IN
    mockStoreBookAsset
      .mockResolvedValueOnce('data:application/pdf;base64,cover')
      .mockResolvedValueOnce('data:application/pdf;base64,print')
  })

  it('stores cover and print pdf artifacts and returns preview images', async () => {
    const { generateBookPdfs } = await import('@/lib/print-books/pdf')
    const result = await generateBookPdfs({
      project: createProject(),
      story: createStory(),
      profile: createProfile(),
    })

    expect(result.coverPdfUrl).toBe('data:application/pdf;base64,cover')
    expect(result.coverPdfReadyForOrdering).toBe(true)
    expect(result.coverPdfSpineSource).toBe('storycot_estimate')
    expect(result.coverPdfSpineWidthIn).toBe(0.18)
    expect(result.coverPdfPageWidthIn).toBe(17.28)
    expect(result.coverPdfPageHeightIn).toBe(8.55)
    expect(result.coverSpineTextIncluded).toBe(false)
    expect(result.printPdfUrl).toBe('data:application/pdf;base64,print')
    expect(result.printPdfPageWidthIn).toBe(8.55)
    expect(result.printPdfPageHeightIn).toBe(8.55)
    expect(result.interiorTextSafeMarginIn).toBe(0.625)
    expect(result.previewImages).toEqual(['data:image/svg+xml;base64,cover', 'data:image/svg+xml;base64,spread'])
    expect(mockStoreBookAsset).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        pathname: 'books/book-1/cover.pdf',
        contentType: 'application/pdf',
      })
    )
    expect(mockStoreBookAsset).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        pathname: 'books/book-1/print.pdf',
        contentType: 'application/pdf',
      })
    )
  })

  it('marks the cover export orderable when an explicit Storycot spine width is configured', async () => {
    process.env.STORYCOT_COVER_SPINE_WIDTH_IN = '0.31'
    mockStoreBookAsset.mockReset()
    mockStoreBookAsset
      .mockResolvedValueOnce('data:application/pdf;base64,cover')
      .mockResolvedValueOnce('data:application/pdf;base64,print')

    const { generateBookPdfs } = await import('@/lib/print-books/pdf')
    const result = await generateBookPdfs({
      project: createProject(),
      story: createStory(),
      profile: createProfile(),
    })

    expect(result.coverPdfReadyForOrdering).toBe(true)
    expect(result.coverPdfSpineSource).toBe('configured')
  })
})
