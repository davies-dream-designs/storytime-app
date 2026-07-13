import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { ChildProfile, Story, Character } from '@/types'

// Vercel functions have a read-only filesystem except /tmp
const DATA_DIR = process.env.VERCEL ? '/tmp/storycot' : join(process.cwd(), 'data')

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readData<T>(filename: string, defaultValue: T): T {
  ensureDataDir()
  const filepath = join(DATA_DIR, filename)
  if (!existsSync(filepath)) return defaultValue
  try {
    return JSON.parse(readFileSync(filepath, 'utf-8')) as T
  } catch {
    return defaultValue
  }
}

function writeData<T>(filename: string, data: T): void {
  ensureDataDir()
  const filepath = join(DATA_DIR, filename)
  writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8')
}

export const db = {
  profiles: {
    getAll(): ChildProfile[] {
      return readData<ChildProfile[]>('profiles.json', [])
    },
    getByUserId(userId: string): ChildProfile[] {
      return this.getAll().filter((p) => p.userId === userId)
    },
    getById(id: string): ChildProfile | undefined {
      return this.getAll().find((p) => p.id === id)
    },
    create(profile: ChildProfile): void {
      const all = this.getAll()
      all.push(profile)
      writeData('profiles.json', all)
    },
    update(id: string, updates: Partial<ChildProfile>): ChildProfile | undefined {
      const all = this.getAll()
      const idx = all.findIndex((p) => p.id === id)
      if (idx === -1) return undefined
      all[idx] = { ...all[idx], ...updates }
      writeData('profiles.json', all)
      return all[idx]
    },
    delete(id: string): boolean {
      const all = this.getAll()
      const filtered = all.filter((p) => p.id !== id)
      if (filtered.length === all.length) return false
      writeData('profiles.json', filtered)
      return true
    },
  },

  stories: {
    getAll(): Story[] {
      return readData<Story[]>('stories.json', [])
    },
    getByUserId(userId: string): Story[] {
      return this.getAll().filter((s) => s.userId === userId)
    },
    getById(id: string): Story | undefined {
      return this.getAll().find((s) => s.id === id)
    },
    getByProfileId(profileId: string): Story[] {
      return this.getAll().filter((s) => s.profileId === profileId)
    },
    create(story: Story): void {
      const all = this.getAll()
      all.push(story)
      writeData('stories.json', all)
    },
    delete(id: string): boolean {
      const all = this.getAll()
      const filtered = all.filter((s) => s.id !== id)
      if (filtered.length === all.length) return false
      writeData('stories.json', filtered)
      return true
    },
  },

  characters: {
    getAll(): Character[] {
      return readData<Character[]>('characters.json', [])
    },
    getByUserId(userId: string): Character[] {
      return this.getAll().filter((c) => c.userId === userId)
    },
    getByProfileId(profileId: string): Character[] {
      return this.getAll().filter((c) => c.profileId === profileId)
    },
    getById(id: string): Character | undefined {
      return this.getAll().find((c) => c.id === id)
    },
    create(character: Character): void {
      const all = this.getAll()
      all.push(character)
      writeData('characters.json', all)
    },
    update(id: string, updates: Partial<Character>): Character | undefined {
      const all = this.getAll()
      const idx = all.findIndex((c) => c.id === id)
      if (idx === -1) return undefined
      all[idx] = { ...all[idx], ...updates }
      writeData('characters.json', all)
      return all[idx]
    },
    delete(id: string): boolean {
      const all = this.getAll()
      const filtered = all.filter((c) => c.id !== id)
      if (filtered.length === all.length) return false
      writeData('characters.json', filtered)
      return true
    },
  },
}
