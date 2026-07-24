import type { Page } from '@playwright/test'

const DEFAULT_BASE = 'https://dev.storycot.com'

export function getBaseUrl(): string {
  return process.env.PLAYWRIGHT_BASE_URL ?? DEFAULT_BASE
}

export function getBypassUrl(url: string): string {
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (!bypassSecret) return url

  const nextUrl = new URL(url)
  nextUrl.searchParams.set('x-vercel-set-bypass-cookie', 'true')
  nextUrl.searchParams.set('x-vercel-protection-bypass', bypassSecret)
  return nextUrl.toString()
}

async function getSignInToken(): Promise<string> {
  const testUserId = process.env.E2E_TEST_USER_ID ?? 'user_3GVKe5HmZpQR7HRWFrrgwxc0Vxs'
  // CLERK_SECRET_KEY_DEV is the OpenHands secret name; fall back to CLERK_SECRET_KEY for local runs
  const clerkSecret = process.env.CLERK_SECRET_KEY_DEV ?? process.env.CLERK_SECRET_KEY

  if (!clerkSecret) {
    throw new Error('CLERK_SECRET_KEY_DEV (or CLERK_SECRET_KEY) is required for Playwright sign-in token flow.')
  }

  const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${clerkSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: testUserId, expires_in_seconds: 120 }),
  })

  if (!res.ok) {
    throw new Error(`Failed to create Clerk sign-in token: ${res.status} ${await res.text()}`)
  }

  const data = await res.json() as { token: string }
  return data.token
}

export async function signIn(page: Page) {
  const baseUrl = getBaseUrl()

  await page.goto(getBypassUrl(`${baseUrl}/en`))
  await page.waitForLoadState('networkidle')

  const token = await getSignInToken()
  await page.goto(`${baseUrl}/en/sign-in?__clerk_ticket=${token}`)
  await page.waitForFunction(() => !window.location.pathname.includes('/sign-in'), { timeout: 20000 })

  if (!page.url().includes('/dashboard')) {
    await page.goto(`${baseUrl}/en/dashboard`)
    await page.waitForLoadState('networkidle')
  }
}
