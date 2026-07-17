import type { ChildAppearance } from './profileAppearance'

export interface ChildProfile {
  id: string
  userId: string
  name: string
  age: number        // kept for backward compat; prefer computing from dateOfBirth
  dateOfBirth?: string // YYYY-MM-DD
  appearance?: ChildAppearance
  favouriteCharacters: string[]
  favouriteActivities: string[]
  favouriteAnimals: string[]
  favouritePlaces: string[]
  lessons: string[]
  createdAt: string
}

export function getAge(profile: ChildProfile): number {
  if (profile.dateOfBirth) {
    const dob = new Date(profile.dateOfBirth)
    const today = new Date()
    const age = today.getFullYear() - dob.getFullYear()
    const m = today.getMonth() - dob.getMonth()
    return m < 0 || (m === 0 && today.getDate() < dob.getDate()) ? age - 1 : age
  }
  return profile.age ?? 0
}

export function formatAge(profile: ChildProfile): string {
  if (profile.dateOfBirth) {
    const dob = new Date(profile.dateOfBirth)
    const today = new Date()
    const totalMonths =
      (today.getFullYear() - dob.getFullYear()) * 12 +
      (today.getMonth() - dob.getMonth()) -
      (today.getDate() < dob.getDate() ? 1 : 0)
    if (totalMonths < 12) {
      return totalMonths <= 1 ? `${totalMonths} month` : `${totalMonths} months`
    }
    const years = Math.floor(totalMonths / 12)
    return years === 1 ? '1 year' : `${years} years`
  }
  const age = profile.age ?? 0
  return age === 1 ? '1 year' : `${age} years`
}

export function isBirthday(profile: ChildProfile): boolean {
  if (!profile.dateOfBirth) return false
  const dob = new Date(profile.dateOfBirth)
  const today = new Date()
  return dob.getMonth() === today.getMonth() && dob.getDate() === today.getDate()
}

export interface StoryPage {
  pageNumber: number
  text: string
  illustrationPrompt: string
}

export interface StorySuggestion {
  title: string
  premise: string
  theme: string
}

export interface Story {
  id: string
  userId: string
  title: string
  profileId: string
  profileName: string
  pages: StoryPage[]
  wordCount: number
  theme: string
  premise?: string
  notes: string
  createdAt: string
  status?: 'generating' | 'ready' | 'failed'
  generationError?: string
  shareToken?: string
}

export interface Character {
  id: string
  userId: string
  name: string
  description: string
  personality: string
  appearance: string
  profileId: string
  createdAt: string
}

export const LESSON_OPTIONS = [
  'kindness',
  'bravery',
  'sharing',
  'trying new things',
  'dealing with emotions',
  'friendship',
  'patience',
  'honesty',
  'gratitude',
  'perseverance',
] as const

export type Lesson = (typeof LESSON_OPTIONS)[number]

export * from './profileAppearance'
