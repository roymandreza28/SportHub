import { test, expect, type Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function registerPlayer(page: Page, name: string) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  await page.goto('/register')
  await page.getByPlaceholder('Name').fill(name)
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password', { exact: true }).fill('password123')
  await page.getByPlaceholder('Confirm password').fill('password123')
  await page.getByRole('button', { name: 'Register' }).click()
  await page.waitForURL(/\/player/)
}

test('a player can post a photo with a caption, and any other player can view it via search (open visibility)', async ({ browser }) => {
  test.setTimeout(60000)

  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  try {
    const nameA = `E2E Poster ${Date.now()}`
    const nameB = `E2E Viewer ${Date.now()}`
    await registerPlayer(pageA, nameA)
    await registerPlayer(pageB, nameB)

    await pageA.getByRole('button', { name: 'Profile', exact: true }).click()
    await pageA.locator('input[type="file"]').setInputFiles(path.join(__dirname, 'fixtures/test-image.png'))
    await pageA.getByPlaceholder('Say something about this photo...').fill('My first post!')
    await pageA.getByRole('button', { name: 'Post', exact: true }).click()

    await expect(pageA.locator('img[alt="My first post!"]')).toBeVisible({ timeout: 20000 })

    // B is not a friend of A — proves posts are open-visibility, not friends-only.
    await pageB.getByRole('button', { name: 'Friends', exact: true }).click()
    await pageB.getByPlaceholder('Search players and coaches by name or email').fill(nameA)
    await pageB.getByRole('link', { name: 'View profile' }).click()

    await expect(pageB.getByRole('heading', { name: nameA })).toBeVisible()
    await expect(pageB.locator('img[alt="My first post!"]')).toBeVisible()
    await expect(pageB.getByRole('button', { name: 'Add friend' })).toBeVisible()
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
