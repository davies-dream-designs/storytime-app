import type { ChildProfile } from '@/types'
import { getAge } from '@/types'
import type { AgeBand } from '@/types/printBook'

export function inferAgeBand(profile: ChildProfile): AgeBand {
  const age = getAge(profile)

  if (age <= 2) return '0-2'
  if (age <= 5) return '3-5'
  return '6-8'
}
