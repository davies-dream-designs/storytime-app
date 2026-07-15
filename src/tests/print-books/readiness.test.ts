import { describe, expect, it } from 'vitest'
import type { BookProject } from '@/types/printBook'
import { getBookReadinessState } from '@/lib/print-books/readiness'

function createProject(overrides: Partial<BookProject> = {}): BookProject {
  return {
    id: 'book-1',
    userId: 'user-1',
    sourceStoryId: 'story-1',
    profileId: 'profile-1',
    ageBand: '3-5',
    status: 'ready',
    trimSize: 'lulu-hardcover-32',
    pageCount: 32,
    spreadCount: 16,
    completedSpreads: 16,
    totalSpreads: 16,
    currentStageLabel: 'Your print-book draft is ready for review.',
    beats: [],
    spreads: [],
    assets: {
      proofVersion: 1,
      exportVersion: 1,
      orderabilityState: 'export_ready',
      previewPdfUrl: 'https://example.com/preview.pdf',
      printPdfUrl: 'https://example.com/print.pdf',
      proofingPassed: true,
      proofingWarnings: [],
      proofingErrors: [],
    },
    retryCount: 0,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('getBookReadinessState', () => {
  it('returns export_ready when proofing still blocks ordering', () => {
    expect(
      getBookReadinessState(
        createProject({
          assets: {
            ...createProject().assets,
            orderabilityState: 'export_ready',
            proofingErrors: ['Separate Lulu cover PDF is missing.'],
          },
        })
      )
    ).toBe('export_ready')
  })

  it('returns draft_ready when exports are not downloadable', () => {
    expect(
      getBookReadinessState(
        createProject({
          assets: {
            ...createProject().assets,
            previewPdfUrl: 'data:application/pdf;base64,preview',
            printPdfUrl: 'data:application/pdf;base64,print',
          },
        })
      )
    ).toBe('draft_ready')
  })

  it('returns order_ready only when proofing is clear and exports are downloadable', () => {
    expect(
      getBookReadinessState(
        createProject({
          assets: {
            ...createProject().assets,
            orderabilityState: 'order_ready',
          },
        }),
      ),
    ).toBe('order_ready')
  })

  it('returns export_ready for normal downloadable drafts', () => {
    expect(getBookReadinessState(createProject())).toBe('export_ready')
  })
})
