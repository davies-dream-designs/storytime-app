import type { BookProject } from '@/types/printBook'
import { isDownloadableBookAssetUrl } from '@/lib/print-books/assets'

export type BookReadinessState = 'building' | 'failed' | 'review_required' | 'ready'

export function hasBlockingProofingIssue(project: Pick<BookProject, 'assets'>): boolean {
  return Boolean(project.assets.proofingErrors && project.assets.proofingErrors.length > 0)
}

export function hasDownloadableBookExport(project: Pick<BookProject, 'assets'>): boolean {
  return (
    isDownloadableBookAssetUrl(project.assets.previewPdfUrl) ||
    isDownloadableBookAssetUrl(project.assets.printPdfUrl)
  )
}

export function getBookReadinessState(
  project: Pick<BookProject, 'status' | 'assets'>
): BookReadinessState {
  if (project.status === 'failed') return 'failed'
  if (project.status !== 'ready') return 'building'
  if (hasBlockingProofingIssue(project) || !hasDownloadableBookExport(project)) {
    return 'review_required'
  }
  return 'ready'
}
