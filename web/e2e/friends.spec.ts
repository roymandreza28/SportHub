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

test('a player can find another player via the header search, send a friend request, and become friends after acceptance', async ({ browser }) => {
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

    // "Find people" now lives in the top nav center search bar, not a sidebar tab.
    await pageA.getByPlaceholder('Search players and coaches').fill(nameB)
    await pageA.getByRole('link', { name: nameB }).click()

    await expect(pageA.getByRole('heading', { name: nameB })).toBeVisible({ timeout: 20000 })
    await pageA.getByRole('button', { name: 'Add friend' }).click()
    await expect(pageA.getByRole('button', { name: 'Cancel request' })).toBeVisible({ timeout: 20000 })

    // Friend requests now surface via the header notification bell.
    await pageB.getByRole('button', { name: 'Notifications' }).hover()
    await expect(pageB.getByText(nameA)).toBeVisible({ timeout: 20000 })
    await pageB.getByRole('button', { name: 'Accept' }).click()
    await expect(pageB.getByRole('button', { name: 'Accept' })).toHaveCount(0, { timeout: 20000 })

    // The friends list now lives on the Profile tab.
    await pageB.getByRole('button', { name: 'Profile', exact: true }).click()
    await expect(pageB.getByText(nameA)).toBeVisible()

    await pageA.goto('/player')
    await pageA.getByRole('button', { name: 'Profile', exact: true }).click()
    await expect(pageA.getByText(nameB)).toBeVisible()
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
