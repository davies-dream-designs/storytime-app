import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockDb = {
  profiles: {
    getAll: vi.fn(() => []),
    getByUserId: vi.fn(() => []),
    create: vi.fn(),
    getById: vi.fn(() => undefined),
    update: vi.fn(() => undefined),
    delete: vi.fn(() => false),
  },
}

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'user-1' })),
}))

async function importRoute() {
  const { GET, POST } = await import('@/app/api/profiles/route')
  return { GET, POST }
}

describe('GET /api/profiles', () => {
  beforeEach(() => {
    vi.resetModules()
    mockDb.profiles.getAll.mockReturnValue([])
    mockDb.profiles.getByUserId.mockReturnValue([])
  })

  it('returns an empty array when no profiles exist', async () => {
    const { GET } = await importRoute()
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })
})

describe('POST /api/profiles', () => {
  beforeEach(() => {
    vi.resetModules()
    mockDb.profiles.create.mockImplementation(() => {})
  })

  it('creates a valid profile', async () => {
    const { POST } = await importRoute()
    const req = new NextRequest('http://localhost/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Max',
        age: 3,
        favouriteAnimals: ['Fox'],
        appearance: {
          skinTone: 'medium',
          hairColor: 'dark_brown',
          hairTexture: 'curly',
          hairStyles: ['pigtails'],
          featureEmphasis: ['round_cheeks', 'wide_eyes', 'button_nose', 'other'],
          consistencyNote: 'Round cheeks, dark curls, red glasses, tiny gap in front teeth that should definitely stay consistent forever',
        },
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('Max')
    expect(body.age).toBe(3)
    expect(body.userId).toBe('user-1')
    expect(body.appearance.skinTone).toBe('medium')
    expect(body.appearance.hairStyles).toEqual(['pigtails'])
    expect(body.appearance.featureEmphasis).toEqual(['round_cheeks', 'wide_eyes', 'button_nose'])
    expect(body.appearance.consistencyNote.length).toBeLessThanOrEqual(140)
  })

  it('rejects a profile without a name', async () => {
    const { POST } = await importRoute()
    const req = new NextRequest('http://localhost/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ age: 3 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('accepts a profile with dateOfBirth instead of age', async () => {
    const { POST } = await importRoute()
    const req = new NextRequest('http://localhost/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Max', dateOfBirth: '2023-06-01' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
  })
})
