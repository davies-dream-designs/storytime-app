import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import createIntlMiddleware from 'next-intl/middleware'
import { NextResponse } from 'next/server'
import { routing } from './i18n/routing'

const handleI18n = createIntlMiddleware(routing)

const isPublicRoute = createRouteMatcher([
  '/(en|es|fr|zh)',
  '/(en|es|fr|zh)/sign-in(.*)',
  '/(en|es|fr|zh)/sign-up(.*)',
  '/(en|es|fr|zh)/s/(.*)',
  '/api/stripe/webhook',
])

export default clerkMiddleware(async (auth, req) => {
  const intlResponse = handleI18n(req)

  if (!isPublicRoute(req)) {
    await auth.protect()
  }

  return intlResponse ?? NextResponse.next()
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
