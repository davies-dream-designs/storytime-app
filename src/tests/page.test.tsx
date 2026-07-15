import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import Home from '@/app/[locale]/page'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('next/image', () => ({
  default: ({ alt }: { alt?: string }) => <span aria-label={alt} />,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

vi.mock('@/components/LanguageSwitcher', () => ({
  default: () => <div>LanguageSwitcher</div>,
}))

vi.mock('@/components/RefCapture', () => ({
  default: () => null,
}))

describe('Home page', () => {
  it('renders the hero headline', async () => {
    render(await Home())
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('includes a link to the dashboard', async () => {
    render(await Home())
    const links = screen.getAllByRole('link')
    expect(links.some((l) => l.getAttribute('href') === '/dashboard')).toBe(true)
  })

  it('renders the translated hero copy', async () => {
    render(await Home())
    expect(screen.getByText('hero')).toBeInTheDocument()
  })
})
