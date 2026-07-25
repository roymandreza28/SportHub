import { test, expect, type Page } from '@playwright/test'
import { apiRequest } from './helpers'

async function registerPlayer(page: Page, name: string): Promise<number> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  await page.goto('/register')
  await page.getByPlaceholder('Name').fill(name)
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password', { exact: true }).fill('password123')
  await page.getByPlaceholder('Confirm password').fill('password123')
  await page.getByRole('button', { name: 'Register' }).click()
  await page.waitForURL(/\/player/)

  const me = await (await apiRequest(page, 'GET', '/api/user')).json()
  return me.id as number
}

test('friends can message each other from the header messages menu, delivered live over the real-time channel', async ({ browser }) => {
  test.setTimeout(60000)

  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  try {
    const nameA = `E2E Chat Alpha ${Date.now()}`
    const nameB = `E2E Chat Beta ${Date.now()}`
    const idA = await registerPlayer(pageA, nameA)
    const idB = await registerPlayer(pageB, nameB)

    // Friend-request UI/round-trip is already covered end to end by
    // friends.spec.ts — establish the relationship directly via API here so
    // this spec's runtime budget goes toward the thing it actually tests:
    // real-time message delivery over the conversation.{id} private channel.
    const sent = await apiRequest(pageA, 'POST', '/api/social/friend-requests', { addressee_id: idB })
    const friendship = await sent.json()
    await apiRequest(pageB, 'POST', `/api/social/friend-requests/${friendship.id}/accept`)

    await pageA.goto('/player')
    await pageA.getByRole('button', { name: 'Messages' }).click()
    await pageA.getByRole('button', { name: 'New', exact: true }).click()
    await pageA.getByText(nameB).click()
    await pageA.getByRole('button', { name: 'Start' }).click()
    // Modal closes only once the conversation is actually created server-side.
    await expect(pageA.getByRole('heading', { name: 'New conversation' })).toHaveCount(0, { timeout: 15000 })

    await pageB.goto('/player')
    await pageB.getByRole('button', { name: 'Messages' }).click()
    await expect(pageB.getByText(nameA).first()).toBeVisible({ timeout: 15000 })
    await pageB.getByText(nameA).first().click()
    // Opening the conversation mounts ConversationWindow, which subscribes to
    // the conversation.{id} private channel — that's an async auth handshake
    // with Reverb, not instant. Give it a moment to actually join before A
    // sends, or the broadcast can fire before B is subscribed to receive it.
    await pageB.waitForTimeout(1500)

    await pageA.getByPlaceholder('Type a message...').fill('Hello from A!')
    await pageA.getByRole('button', { name: 'Send' }).click()

    // B never refreshes — this must arrive over the conversation.{id} private channel.
    await expect(pageB.getByText('Hello from A!')).toBeVisible({ timeout: 15000 })

    await pageB.getByPlaceholder('Type a message...').fill('Hi A, this is B!')
    await pageB.getByRole('button', { name: 'Send' }).click()

    await expect(pageA.getByText('Hi A, this is B!')).toBeVisible({ timeout: 15000 })
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
