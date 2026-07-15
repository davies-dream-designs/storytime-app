import type { BookProject } from '@/types/printBook'
import { isDownloadableBookAssetUrl } from '@/lib/print-books/assets'

export type BookReadinessState = 'building' | 'failed' | 'draft_ready' | 'export_ready' | 'order_ready'

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
  if (!hasDownloadableBookExport(project)) return 'draft_ready'
  if (project.assets.orderabilityState === 'order_ready' && !hasBlockingProofingIssue(project)) return 'order_ready'
  return 'export_ready'
}
