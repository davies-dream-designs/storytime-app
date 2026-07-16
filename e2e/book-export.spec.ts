import { expect, test } from '@playwright/test'
import { getBaseUrl, signIn } from './helpers/auth'

const BASE = getBaseUrl()
const BOOK_ID = process.env.PLAYWRIGHT_BOOK_ID

test('book export inspection captures proofing and download artifacts', async ({ page }) => {
  test.skip(!BOOK_ID, 'Set PLAYWRIGHT_BOOK_ID to inspect a specific print-book project.')

  await signIn(page)
  await page.goto(`${BASE}/en/books/${BOOK_ID}`)
  await page.waitForLoadState('networkidle')

  await expect(page.getByRole('heading', { name: /proofing report/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /preview pdf|open preview pdf/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /print pdf|open print pdf/i })).toBeVisible()

  await page.screenshot({ path: 'test-results/book-detail.png', fullPage: true })

  const previewHref = await page.getByRole('link', { name: /preview pdf|open preview pdf/i }).getAttribute('href')
  const printHref = await page.getByRole('link', { name: /print pdf|open print pdf/i }).getAttribute('href')

  expect(previewHref).toBeTruthy()
  expect(printHref).toBeTruthy()
  expect(previewHref?.startsWith('data:')).toBe(false)
  expect(printHref?.startsWith('data:')).toBe(false)
})
