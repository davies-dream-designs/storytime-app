import { test, expect, Page } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'https://dev.storycot.com'
// Vercel deployment protection bypass URL — set VERCEL_BYPASS_URL in your local .env
// Regenerate with: Vercel MCP → get_access_to_vercel_url (expires ~23h)
const VERCEL_BYPASS = process.env.VERCEL_BYPASS_URL ?? `${BASE}/?_vercel_share=`
const TEST_USER_ID = process.env.E2E_TEST_USER_ID ?? 'user_3GVKe5HmZpQR7HRWFrrgwxc0Vxs'
const CLERK_SECRET = process.env.CLERK_SECRET_KEY!

async function getSignInToken(): Promise<string> {
  const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CLERK_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: TEST_USER_ID, expires_in_seconds: 120 }),
  })
  const data = await res.json() as { token: string }
  return data.token
}

async function signIn(page: Page) {
  // Hit bypass URL first to set the Vercel deployment protection cookie
  await page.goto(VERCEL_BYPASS)
  await page.waitForLoadState('networkidle')

  // Get a fresh Clerk sign-in token — Clerk auto-redeems it and redirects away from /sign-in
  const token = await getSignInToken()
  await page.goto(`${BASE}/sign-in?__clerk_ticket=${token}`)
  // Token-based sign-in redirects to / not /dashboard — navigate there explicitly
  await page.waitForFunction(() => !window.location.pathname.startsWith('/sign-in'), { timeout: 20000 })
  if (!page.url().includes('/dashboard')) {
    await page.goto(`${BASE}/dashboard`)
    await page.waitForLoadState('networkidle')
  }
}

// ─── Test 1: Mobile hamburger ─────────────────────────────────────────────────

test('mobile nav hamburger opens and closes drawer', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await signIn(page)

  const hamburger = page.getByRole('button', { name: /open menu/i })
  await expect(hamburger).toBeVisible()

  await hamburger.click()
  await expect(page.getByRole('link', { name: /📚 stories/i })).toBeVisible()

  await page.getByRole('button', { name: /close menu/i }).click()
  await expect(page.getByRole('link', { name: /📚 stories/i })).not.toBeVisible()

  await ctx.close()
})

// ─── Test 2: Nav shows SVG logo, not emoji ────────────────────────────────────

test('nav shows SVG logo not emoji', async ({ page }) => {
  await signIn(page)
  await expect(page.locator('header img[src="/icon-light.svg"]')).toBeVisible()
})

// ─── Test 3: Story library page loads ────────────────────────────────────────

test('story library page loads with correct UI', async ({ page }) => {
  await signIn(page)
  await page.goto(`${BASE}/stories`)
  await page.waitForLoadState('networkidle')

  const hasStories = await page.getByPlaceholder(/search stories/i).isVisible()
  if (hasStories) {
    // Search bar exists — test search filtering
    const searchInput = page.getByPlaceholder(/search stories/i)
    await searchInput.fill('zzzzzzzzzzz')
    await expect(page.getByText(/no stories match/i)).toBeVisible()
    await page.getByRole('button', { name: /clear filters/i }).click()
    await expect(searchInput).toHaveValue('')
  } else {
    // Empty state — verify it renders correctly (not broken)
    await expect(page.getByText(/your library is empty/i)).toBeVisible()
    await expect(page.locator('a[href="/profiles/new"], a[href="/stories/new"]').first()).toBeVisible()
  }
})

// ─── Test 4: Profile creation shows months for babies ────────────────────────

test('can create a child profile — age shows months for under-1', async ({ page }) => {
  await signIn(page)
  await page.goto(`${BASE}/profiles/new`)
  await page.waitForLoadState('networkidle')

  await page.getByLabel(/child.s name/i).fill('Playwright Jr')

  // DOB form uses 3 separate dropdowns: Day / Month / Year
  // Set to 6 months ago: Jan 14, 2026 (today is July 14, 2026 → 6 months old)
  await page.locator('#dob-day').selectOption('14')
  await page.locator('#dob-month').selectOption('1')   // January = value "1"
  await page.locator('#dob-year').selectOption('2026')

  await page.getByRole('button', { name: /save|create/i }).click()

  await page.waitForURL(/\/profiles\//, { timeout: 10000 })
  await expect(page.getByText(/months old/i)).toBeVisible()
})

// ─── Test 5: Story generation decrements credits ──────────────────────────────

test('generating a story decrements credits', async ({ page }) => {
  await signIn(page)

  await page.goto(`${BASE}/account`)
  await page.waitForLoadState('networkidle')

  const creditEl = page.locator('p.font-display.text-3xl').first()
  const before = parseInt((await creditEl.textContent()) ?? '0', 10)
  expect(before).toBeGreaterThan(0)

  await page.goto(`${BASE}/stories/new`)
  await page.waitForLoadState('networkidle')

  const profileOption = page.getByText('Playwright Jr')
  if (!(await profileOption.isVisible())) { test.skip(); return }
  await profileOption.click()

  await page.getByText(/wonder/i).first().click()
  await page.getByRole('button', { name: /generate/i }).click()

  await page.waitForURL(/\/stories\//, { timeout: 60000 })

  await page.goto(`${BASE}/account`)
  await page.waitForLoadState('networkidle')

  const after = parseInt((await creditEl.textContent()) ?? '0', 10)
  expect(after).toBe(before - 1)
})

// ─── Test 6: Print page branding ─────────────────────────────────────────────

test('print page shows Storycot logo not emoji', async ({ page }) => {
  await signIn(page)
  await page.goto(`${BASE}/stories`)
  await page.waitForLoadState('networkidle')

  const firstStory = page.locator('a[href^="/stories/"]').first()
  if (!(await firstStory.isVisible())) { test.skip(); return }

  const href = await firstStory.getAttribute('href')
  await page.goto(`${BASE}${href}/print`)
  await page.waitForLoadState('networkidle')

  await expect(page.locator('img[src="/icon-dark.svg"]').first()).toBeVisible()
  await expect(page.getByText('Storycot · storycot.com').first()).toBeVisible()
})

// ─── Test 7: Stripe credit pack → checkout ────────────────────────────────────

test('Stripe credit pack redirects to checkout and payment succeeds', async ({ page }) => {
  await signIn(page)
  await page.goto(`${BASE}/account`)
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: /starter/i }).click()

  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15000 })
  await expect(page.getByText(/storycot starter/i)).toBeVisible()

  // Fill Stripe test card
  await page.getByPlaceholder(/card number/i).fill('4242424242424242')
  await page.getByPlaceholder(/mm \/ yy/i).fill('12 / 26')
  await page.getByPlaceholder(/cvc/i).fill('123')
  await page.getByPlaceholder(/name on card/i).fill('Playwright Test')
  await page.getByRole('button', { name: /pay/i }).click()

  await page.waitForURL(/account\?success/, { timeout: 30000 })
  await expect(page.getByText(/payment successful/i)).toBeVisible()
})
