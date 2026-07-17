import type { BookProjectStatus } from '@/types/printBook'

const STATUS_LABELS: Record<BookProjectStatus, string> = {
  queued: 'Dreaming up the adventure...',
  planning: 'Dreaming up the adventure...',
  bible: 'Sketching your little hero...',
  illustrating: 'Painting moonlit pages...',
  composing: 'Weaving the story into a real book...',
  proofing: 'Tucking the final pages into place...',
  ready: 'Your print-book draft is ready for review.',
  failed: 'This book needs another try.',
}

export function getBookProjectStageLabel(status: BookProjectStatus): string {
  return STATUS_LABELS[status]
}
