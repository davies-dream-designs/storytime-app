import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import Home from '@/app/page'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

describe('Home page', () => {
  it('renders the hero headline', () => {
    render(<Home />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('includes a link to the dashboard', () => {
    render(<Home />)
    const links = screen.getAllByRole('link')
    expect(links.some((l) => l.getAttribute('href') === '/dashboard')).toBe(true)
  })

  it('mentions bedtime stories', () => {
    render(<Home />)
    expect(screen.getAllByText(/bedtime stories/i).length).toBeGreaterThan(0)
  })
})
