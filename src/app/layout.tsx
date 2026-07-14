import type { Metadata } from 'next'
import { Fredoka, Nunito } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
})

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-body',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://storycot.com'),
  title: 'Storycot — AI Bedtime Stories for Kids',
  description:
    'Create magical, personalised bedtime stories for your children with AI. Feature their favourite toys, animals, and adventures. Save and print as a beautiful storybook.',
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon.png', type: 'image/png' },
    ],
    apple: '/icon.png',
  },
  openGraph: {
    title: 'Storycot — AI Bedtime Stories for Kids',
    description:
      'Create magical, personalised bedtime stories for your children with AI.',
    url: 'https://storycot.com',
    siteName: 'Storycot',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Storycot' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Storycot — AI Bedtime Stories for Kids',
    description: 'Create magical, personalised bedtime stories for your children with AI.',
    images: ['/og-image.png'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${fredoka.variable} ${nunito.variable}`}>
        <body className="bg-parchment text-ink font-body antialiased">{children}</body>
      </html>
    </ClerkProvider>
  )
}
