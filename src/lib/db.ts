import { kv } from '@vercel/kv'
import type { ChildProfile, Story, Character } from '@/types'

export const db = {
  profiles: {
    async getAll(): Promise<ChildProfile[]> {
      return (await kv.get<ChildProfile[]>('profiles')) ?? []
    },
    async getByUserId(userId: string): Promise<ChildProfile[]> {
      return (await this.getAll()).filter((p) => p.userId === userId)
    },
    async getById(id: string): Promise<ChildProfile | undefined> {
      return (await this.getAll()).find((p) => p.id === id)
    },
    async create(profile: ChildProfile): Promise<void> {
      const all = await this.getAll()
      all.push(profile)
      await kv.set('profiles', all)
    },
    async update(id: string, updates: Partial<ChildProfile>): Promise<ChildProfile | undefined> {
      const all = await this.getAll()
      const idx = all.findIndex((p) => p.id === id)
      if (idx === -1) return undefined
      all[idx] = { ...all[idx], ...updates }
      await kv.set('profiles', all)
      return all[idx]
    },
    async delete(id: string): Promise<boolean> {
      const all = await this.getAll()
      const filtered = all.filter((p) => p.id !== id)
      if (filtered.length === all.length) return false
      await kv.set('profiles', filtered)
      return true
    },
  },

  stories: {
    async getAll(): Promise<Story[]> {
      return (await kv.get<Story[]>('stories')) ?? []
    },
    async getByUserId(userId: string): Promise<Story[]> {
      return (await this.getAll()).filter((s) => s.userId === userId)
    },
    async getById(id: string): Promise<Story | undefined> {
      return (await this.getAll()).find((s) => s.id === id)
    },
    async getByProfileId(profileId: string): Promise<Story[]> {
      return (await this.getAll()).filter((s) => s.profileId === profileId)
    },
    async create(story: Story): Promise<void> {
      const all = await this.getAll()
      all.push(story)
      await kv.set('stories', all)
    },
    async delete(id: string): Promise<boolean> {
      const all = await this.getAll()
      const filtered = all.filter((s) => s.id !== id)
      if (filtered.length === all.length) return false
      await kv.set('stories', filtered)
      return true
    },
  },

  characters: {
    async getAll(): Promise<Character[]> {
      return (await kv.get<Character[]>('characters')) ?? []
    },
    async getByUserId(userId: string): Promise<Character[]> {
      return (await this.getAll()).filter((c) => c.userId === userId)
    },
    async getByProfileId(profileId: string): Promise<Character[]> {
      return (await this.getAll()).filter((c) => c.profileId === profileId)
    },
    async getById(id: string): Promise<Character | undefined> {
      return (await this.getAll()).find((c) => c.id === id)
    },
    async create(character: Character): Promise<void> {
      const all = await this.getAll()
      all.push(character)
      await kv.set('characters', all)
    },
    async update(id: string, updates: Partial<Character>): Promise<Character | undefined> {
      const all = await this.getAll()
      const idx = all.findIndex((c) => c.id === id)
      if (idx === -1) return undefined
      all[idx] = { ...all[idx], ...updates }
      await kv.set('characters', all)
      return all[idx]
    },
    async delete(id: string): Promise<boolean> {
      const all = await this.getAll()
      const filtered = all.filter((c) => c.id !== id)
      if (filtered.length === all.length) return false
      await kv.set('characters', filtered)
      return true
    },
  },
}
