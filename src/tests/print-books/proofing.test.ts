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
    trimSize: 'storycot-dynamic-square',
    pageCount: 24,
    spreadCount: 12,
    completedSpreads: 12,
    totalSpreads: 12,
    currentStageLabel: 'Tucking the final pages into place...',
    beats: [],
    spreads: Array.from({ length: 12 }, (_, index) => ({
      id: `spread-${index + 1}`,
      bookProjectId: 'book-1',
      sequence: index + 1,
      pageStart: index * 2 + 1,
      pageEnd: index * 2 + 2,
      layoutType: index < 2 ? 'front_matter' : index > 9 ? 'end_matter' : 'text_art',
      leftPageText: 'Left text',
      rightPageText: 'Right text',
      sceneBrief: 'Scene brief',
      illustrationPrompt: 'Illustration prompt',
      imageUrl: `https://example.com/${index + 1}.png`,
    })),
    assets: {
      proofVersion: 0,
      artMode: 'generated',
      coverImageUrl: 'https://example.com/cover.png',
      coverPdfUrl: 'https://example.com/cover.pdf',
      coverPdfPageWidthIn: 17.28,
      coverPdfPageHeightIn: 8.55,
      coverPdfSpineSource: 'storycot_estimate',
      coverPdfSpineWidthIn: 0.18,
      coverSpineTextIncluded: false,
      printPdfUrl: 'https://example.com/print.pdf',
      printPdfPageWidthIn: 8.55,
      printPdfPageHeightIn: 8.55,
      interiorTextSafeMarginIn: 0.625,
      previewImages: Array.from({ length: 12 }, (_, index) => `https://example.com/${index + 1}.png`),
    },
    retryCount: 0,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  }
}

describe('runStorycotPrintProofing', () => {
  it('passes a structurally complete export and emits review warnings', async () => {
    const { runStorycotPrintProofing } = await import('@/lib/print-books/proofing')
    const report = runStorycotPrintProofing(createBookProject())

    expect(report.passed).toBe(true)
    expect(report.errors).toEqual([])
    expect(report.warnings.length).toBeGreaterThan(0)
    expect(report.orderabilityState).toBe('export_ready')
    expect(report.checks.some((check) => check.key === 'page_count' && check.status === 'pass')).toBe(true)
  })

  it('fails when core print artifacts are missing', async () => {
    const { runStorycotPrintProofing } = await import('@/lib/print-books/proofing')
    const project = createBookProject()
    project.assets.coverPdfUrl = undefined
    project.assets.printPdfUrl = undefined
    project.spreads[4] = {
      ...project.spreads[4]!,
      imageUrl: undefined,
    }

    const report = runStorycotPrintProofing(project)
    expect(report.passed).toBe(false)
    expect(report.errors.some((error) => error.includes('Separate cover PDF is missing'))).toBe(true)
    expect(report.errors.some((error) => error.includes('Print PDF is missing'))).toBe(true)
    expect(report.errors.some((error) => error.includes('Spread images are missing'))).toBe(true)
    expect(report.orderabilityState).toBe('draft_only')
  })

  it('passes when the cover spine width comes from the Storycot spine estimate', async () => {
    const { runStorycotPrintProofing } = await import('@/lib/print-books/proofing')
    const project = createBookProject()
    project.assets.coverPdfSpineSource = 'storycot_estimate'
    project.assets.coverPdfSpineWidthIn = 0.18

    const report = runStorycotPrintProofing(project)
    expect(report.passed).toBe(true)
    expect(report.checks.some((check) => check.key === 'spine_width' && check.status === 'pass')).toBe(true)
    expect(report.orderabilityState).toBe('export_ready')
  })

  it('marks placeholder illustration sets as export-ready rather than order-ready', async () => {
    const { runStorycotPrintProofing } = await import('@/lib/print-books/proofing')
    const project = createBookProject()
    project.assets.artMode = 'placeholder'

    const report = runStorycotPrintProofing(project)
    expect(report.passed).toBe(true)
    expect(report.orderabilityState).toBe('export_ready')
    expect(report.checks.some((check) => check.key === 'spread_art' && check.status === 'warn')).toBe(true)
  })

  it('only returns order_ready during strict finalization', async () => {
    const { runStorycotPrintProofing } = await import('@/lib/print-books/proofing')
    const project = createBookProject()
    project.assets.coverPdfSpineSource = 'storycot_estimate'
    project.assets.coverPdfSpineWidthIn = 0.18

    const report = runStorycotPrintProofing(project, { strictForOrdering: true })
    expect(report.passed).toBe(true)
    expect(report.orderabilityState).toBe('order_ready')
  })

  it('blocks strict finalization when draft artwork remains', async () => {
    const { runStorycotPrintProofing } = await import('@/lib/print-books/proofing')
    const project = createBookProject()
    project.assets.artMode = 'placeholder'

    const report = runStorycotPrintProofing(project, { strictForOrdering: true })
    expect(report.passed).toBe(false)
    expect(report.orderabilityState).toBe('export_ready')
    expect(report.checks.some((check) => check.key === 'spread_art' && check.status === 'fail')).toBe(true)
  })
})
