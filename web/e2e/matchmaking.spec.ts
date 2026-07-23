import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test('two players requesting the same sport get paired live over the real-time channel', async ({ browser }) => {
  test.setTimeout(60000)

  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  try {
    await loginAs(pageA, 'player@sporthub.test', 'password')
    await loginAs(pageB, 'player2@sporthub.test', 'password')

    await pageA.goto('/player')
    await pageB.goto('/player')

    // Each sidebar item shows its own content now — switch to the
    // Matchmaking tab, which is the only tab with a sport picker on screen.
    await pageA.getByRole('button', { name: 'Matchmaking', exact: true }).click()
    await pageB.getByRole('button', { name: 'Matchmaking', exact: true }).click()
    const matchmakingSportA = pageA.getByRole('combobox')
    const matchmakingSportB = pageB.getByRole('combobox')

    // Player A opens a request and waits — no opponent yet.
    await matchmakingSportA.selectOption({ label: 'Chess' })
    await pageA.getByRole('button', { name: 'Find a match' }).click()
    // .first() for the same reason as below — accumulated open Chess requests
    // between these fixed seed accounts from earlier runs.
    await expect(pageA.getByText('Looking for a match...').first()).toBeVisible()

    // Player B requests the same sport — this should synchronously pair them
    // server-side, and Player A's UI should update via the matchmaking.{id}
    // private channel without any manual refresh.
    await matchmakingSportB.selectOption({ label: 'Chess' })
    await pageB.getByRole('button', { name: 'Find a match' }).click()

    // .first() because repeated runs against a persistent dev DB accumulate
    // earlier "matched" requests between these same two fixed seed accounts.
    await expect(pageB.getByText(/Matched! with .*Pat Player/).first()).toBeVisible()
    await expect(pageA.getByText(/Matched! with .*Second Player/).first()).toBeVisible({ timeout: 10000 })
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
