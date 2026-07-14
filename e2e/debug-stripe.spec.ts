import { test } from '@playwright/test'

const BASE = 'https://dev.storycot.com'
const VERCEL_BYPASS = process.env.VERCEL_BYPASS_URL ?? ''
const TEST_USER_ID = process.env.E2E_TEST_USER_ID ?? 'user_3GVKe5HmZpQR7HRWFrrgwxc0Vxs'
const CLERK_SECRET = process.env.CLERK_SECRET_KEY!

test('debug stripe checkout page structure', async ({ page }) => {
  await page.goto(VERCEL_BYPASS)
  await page.waitForLoadState('networkidle')

  const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${CLERK_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: TEST_USER_ID, expires_in_seconds: 120 }),
  })
  const { token } = await res.json() as { token: string }
  await page.goto(`${BASE}/sign-in?__clerk_ticket=${token}`)
  await page.waitForFunction(() => !window.location.pathname.startsWith('/sign-in'), { timeout: 20000 })

  await page.goto(`${BASE}/account`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'test-results/debug-account.png', fullPage: true })

  await page.getByRole('button', { name: /get 10 stories/i }).click()
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15000 })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(4000)
  await page.screenshot({ path: 'test-results/debug-stripe-checkout.png', fullPage: true })

  // Log all iframes
  const frames = page.frames()
  console.log('Total frames:', frames.length)
  for (const f of frames) {
    console.log('Frame URL:', f.url(), '| Name:', f.name())
  }

  // Try to find card number in various ways
  const direct = await page.getByPlaceholder(/card number/i).isVisible().catch(() => false)
  console.log('Direct card number visible:', direct)

  for (const f of frames) {
    const inFrame = await f.getByPlaceholder(/card number/i).isVisible().catch(() => false)
    if (inFrame) console.log('Found card number in frame:', f.url())
  }
})
