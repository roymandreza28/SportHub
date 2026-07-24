import { test, expect, type Page } from '@playwright/test'

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

test('a player can find another player, send a friend request, and become friends after acceptance', async ({ browser }) => {
  test.setTimeout(60000)

  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  try {
    const nameA = `E2E Friend Alpha ${Date.now()}`
    const nameB = `E2E Friend Beta ${Date.now()}`
    await registerPlayer(pageA, nameA)
    await registerPlayer(pageB, nameB)

    await pageA.getByRole('button', { name: 'Friends', exact: true }).click()
    await pageA.getByPlaceholder('Search players and coaches by name or email').fill(nameB)
    await pageA.getByRole('link', { name: 'View profile' }).click()

    await expect(pageA.getByRole('heading', { name: nameB })).toBeVisible()
    await pageA.getByRole('button', { name: 'Add friend' }).click()
    await expect(pageA.getByRole('button', { name: 'Cancel request' })).toBeVisible()

    await pageB.getByRole('button', { name: 'Friends', exact: true }).click()
    await expect(pageB.getByText(nameA)).toBeVisible()
    await pageB.getByRole('button', { name: 'Accept' }).click()

    // Acceptance moves the request out of "incoming" and into the friends list.
    await expect(pageB.getByRole('button', { name: 'Accept' })).toHaveCount(0)
    await expect(pageB.getByText(nameA)).toBeVisible()

    // A's own view is stale until it refetches — a fresh visit to the tab
    // should show the now-accepted friendship without any manual refresh logic.
    await pageA.goto('/player')
    await pageA.getByRole('button', { name: 'Friends', exact: true }).click()
    await expect(pageA.getByText(nameB)).toBeVisible()
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
