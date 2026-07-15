import { test, expect } from '@playwright/test'
import { getBaseUrl, signIn } from './helpers/auth'

const BASE = getBaseUrl()

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
  await page.goto(`${BASE}/en/stories`)
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
    await expect(page.locator('a[href="/en/profiles/new"], a[href="/en/stories/new"]').first()).toBeVisible()
  }
})

// ─── Test 4: Profile creation shows months for babies ────────────────────────

test('can create a child profile — age shows months for under-1', async ({ page }) => {
  await signIn(page)
  await page.goto(`${BASE}/en/profiles/new`)
  await page.waitForLoadState('networkidle')

  await page.getByLabel(/child.s name/i).fill('Playwright Jr')

  // DOB form uses 3 separate dropdowns: Day / Month / Year
  // Set to 6 months ago: Jan 14, 2026 (today is July 14, 2026 → 6 months old)
  await page.locator('#dob-day').selectOption('14')
  await page.locator('#dob-month').selectOption('1')   // January = value "1"
  await page.locator('#dob-year').selectOption('2026')

  await page.getByRole('button', { name: /create profile/i }).click()

  await page.waitForURL(/\/profiles\//, { timeout: 10000 })
  await expect(page.getByText(/months old/i)).toBeVisible()
})

// ─── Test 5: Story generation decrements credits ──────────────────────────────

test('generating a story decrements credits', async ({ page }) => {
  await signIn(page)

  await page.goto(`${BASE}/en/account`)
  await page.waitForLoadState('networkidle')

  const creditEl = page.locator('p.font-display.text-3xl').first()
  const before = parseInt((await creditEl.textContent()) ?? '0', 10)
  expect(before).toBeGreaterThan(0)

  await page.goto(`${BASE}/en/stories/new`)
  await page.waitForLoadState('networkidle')

  // Profile cards are buttons — use first() to avoid matching "Get story ideas for..." button
  const profileOption = page.getByRole('button', { name: /Playwright Jr/i }).first()
  if (!(await profileOption.isVisible())) { test.skip(); return }
  await profileOption.click()

  // After selecting a profile, click "Get story ideas" to fetch suggestions
  await page.getByRole('button', { name: /get story ideas/i }).click()

  // Wait for skeleton loaders to disappear, then click the first suggestion card
  await page.waitForFunction(
    () => document.querySelectorAll('[class*="animate-pulse"]').length === 0,
    { timeout: 15000 }
  ).catch(() => {})
  await page.locator('button[class*="rounded-2xl"]').first().click()

  await page.getByRole('button', { name: /✨ generate story/i }).click()

  // Wait for a real story URL — /stories/<uuid>, not /stories/new
  await page.waitForURL(/\/stories\/[a-zA-Z0-9-]{10,}/, { timeout: 90000 })

  await page.goto(`${BASE}/en/account`)
  await page.waitForLoadState('networkidle')

  // Re-query after navigation
  const afterEl = page.locator('p.font-display.text-3xl').first()
  const afterText = (await afterEl.textContent()) ?? '0'
  // Admin users show '∞' and don't consume credits — skip assertion for them
  if (afterText !== '∞') {
    const after = parseInt(afterText, 10)
    expect(after).toBe(before - 1)
  }
})

// ─── Test 6: Print page branding ─────────────────────────────────────────────

test('print page shows Storycot logo not emoji', async ({ page }) => {
  await signIn(page)
  await page.goto(`${BASE}/en/stories`)
  await page.waitForLoadState('networkidle')

  // Exclude /en/stories/new — only match actual story pages (/en/stories/<uuid>)
  const firstStory = page.locator('a[href^="/en/stories/"]:not([href="/en/stories/new"])').first()
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
  await page.goto(`${BASE}/en/account`)
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: /get 10 stories/i }).click()

  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15000 })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(3000) // Let payment elements render

  // Verify correct product
  await expect(page.getByText(/storycot starter/i)).toBeVisible()

  // Stripe Link may pre-load a saved card in an iframe. Check for it first.
  const paymentFrame = page.frameLocator('iframe').first()
  const linkButton = paymentFrame.getByRole('button', { name: /pay securely with link/i })
  const linkVisible = await linkButton.isVisible({ timeout: 2000 }).catch(() => false)

  if (linkVisible) {
    // Use the pre-saved Link card — fastest path to payment
    await linkButton.click()
    await page.waitForTimeout(2000)
    // Link may show an inline confirm button after clicking
    const confirmBtn = page.getByRole('button', { name: /^pay/i }).last()
    if (await confirmBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await confirmBtn.click()
    }
  } else {
    // Manual card entry — use a unique email to avoid Stripe Link pre-loading
    const emailField = page.getByPlaceholder(/email@example\.com/i)
    if (await emailField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await emailField.fill(`playwright+${Date.now()}@storycot-test.com`)
    }
    await page.getByPlaceholder('1234 1234 1234 1234').pressSequentially('4242424242424242')
    await page.getByPlaceholder('MM / YY').pressSequentially('1226')
    await page.getByPlaceholder('CVC').pressSequentially('123')
    const nameField = page.getByPlaceholder(/full name on card/i)
    if (await nameField.isVisible({ timeout: 1000 }).catch(() => false)) {
      await nameField.fill('Playwright Test')
    }
    // Stripe AU checkout requires phone number
    const phoneField = page.getByPlaceholder(/0412 345 678/i)
    if (await phoneField.isVisible({ timeout: 1000 }).catch(() => false)) {
      await phoneField.fill('0400000000')
    }
    await page.getByRole('button', { name: /^pay/i }).click()
  }

  // Stripe redirects to success_url — may go to storycot.com (prod) when testing against dev
  // Just verify we successfully left checkout.stripe.com (payment was accepted)
  await page.waitForURL(url => !url.href.includes('checkout.stripe.com'), { timeout: 60000 })
  expect(page.url()).not.toContain('checkout.stripe.com')
})
