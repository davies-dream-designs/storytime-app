import type { Metadata } from 'next'
import { Fredoka, Nunito } from 'next/font/google'
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
  title: 'Storycot — AI Bedtime Stories for Kids',
  description:
    'Create magical, personalised bedtime stories for your children with AI. Feature their favourite toys, animals, and adventures. Save and print as a beautiful storybook.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${nunito.variable}`}>
      <body className="bg-parchment text-ink font-body antialiased">{children}</body>
    </html>
  )
}
