import { describe, expect, it } from 'vitest'
import type { BookProject } from '@/types/printBook'

function createBookProject(): BookProject {
  return {
    id: 'book-1',
    userId: 'user-1',
    sourceStoryId: 'story-1',
    profileId: 'profile-1',
    ageBand: '3-5',
    status: 'proofing',
    trimSize: 'lulu-hardcover-32',
    pageCount: 32,
    spreadCount: 16,
    completedSpreads: 16,
    totalSpreads: 16,
    currentStageLabel: 'Tucking the final pages into place...',
    beats: [],
    spreads: Array.from({ length: 16 }, (_, index) => ({
      id: `spread-${index + 1}`,
      bookProjectId: 'book-1',
      sequence: index + 1,
      pageStart: index * 2 + 1,
      pageEnd: index * 2 + 2,
      layoutType: index < 2 ? 'front_matter' : index > 13 ? 'end_matter' : 'text_art',
      leftPageText: 'Left text',
      rightPageText: 'Right text',
      sceneBrief: 'Scene brief',
      illustrationPrompt: 'Illustration prompt',
      imageUrl: `https://example.com/${index + 1}.png`,
    })),
    assets: {
      proofVersion: 0,
      coverImageUrl: 'https://example.com/cover.png',
      coverPdfUrl: 'https://example.com/cover.pdf',
      previewPdfUrl: 'https://example.com/preview.pdf',
      printPdfUrl: 'https://example.com/print.pdf',
      previewImages: Array.from({ length: 16 }, (_, index) => `https://example.com/${index + 1}.png`),
    },
    retryCount: 0,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  }
}

describe('runLuluProofing', () => {
  it('passes a structurally complete export and emits review warnings', async () => {
    const { runLuluProofing } = await import('@/lib/print-books/proofing')
    const report = runLuluProofing(createBookProject())

    expect(report.passed).toBe(true)
    expect(report.errors).toEqual([])
    expect(report.warnings.length).toBeGreaterThan(0)
  })

  it('fails when core print artifacts are missing', async () => {
    const { runLuluProofing } = await import('@/lib/print-books/proofing')
    const project = createBookProject()
    project.assets.coverPdfUrl = undefined
    project.assets.printPdfUrl = undefined
    project.spreads[4] = {
      ...project.spreads[4]!,
      imageUrl: undefined,
    }

    const report = runLuluProofing(project)
    expect(report.passed).toBe(false)
    expect(report.errors.some((error) => error.includes('Separate Lulu cover PDF is missing'))).toBe(true)
    expect(report.errors.some((error) => error.includes('Print PDF is missing'))).toBe(true)
    expect(report.errors.some((error) => error.includes('Spread images are missing'))).toBe(true)
  })
})
