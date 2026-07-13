export interface ChildProfile {
  id: string
  userId: string
  name: string
  age: number
  favouriteCharacters: string[]
  favouriteActivities: string[]
  favouriteAnimals: string[]
  favouritePlaces: string[]
  lessons: string[]
  createdAt: string
}

export interface StoryPage {
  pageNumber: number
  text: string
  illustrationPrompt: string
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
  notes: string
  createdAt: string
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
