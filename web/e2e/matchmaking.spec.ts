import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers'

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

async function befriend(pageA: Page, pageB: Page, nameA: string, nameB: string) {
  await pageA.getByPlaceholder('Search players and coaches').fill(nameB)
  await pageA.getByRole('link', { name: nameB }).click()
  await expect(pageA.getByRole('heading', { name: nameB })).toBeVisible({ timeout: 20000 })
  await pageA.getByRole('button', { name: 'Add friend' }).click()
  await expect(pageA.getByRole('button', { name: 'Cancel request' })).toBeVisible({ timeout: 20000 })

  await pageB.getByRole('button', { name: 'Notifications' }).hover()
  await expect(pageB.getByText(nameA)).toBeVisible({ timeout: 20000 })
  await pageB.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(pageB.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0, { timeout: 20000 })
}

test('two players requesting the same sport and format get paired live over the real-time channel', async ({ browser }) => {
  test.setTimeout(60000)

  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  try {
    // Freshly registered accounts, not the fixed seed accounts — a fixed
    // account can accumulate a coach-assigned skill level from unrelated
    // manual testing over time, which would make it stop matching an
    // unassessed opponent (skill-gated matching is intentional; a fresh
    // account guarantees "unassessed" instead of assuming it).
    const nameA = `E2E Player Alpha ${Date.now()}`
    const nameB = `E2E Player Beta ${Date.now()}`
    await registerPlayer(pageA, nameA)
    await registerPlayer(pageB, nameB)

    // Each sidebar item shows its own content now — switch to the
    // Matchmaking tab, which is the only tab with a sport picker on screen.
    await pageA.getByRole('button', { name: 'Matchmaking', exact: true }).click()
    await pageB.getByRole('button', { name: 'Matchmaking', exact: true }).click()

    // Join Match is the default mode, but click it explicitly so the test
    // doesn't silently depend on that default.
    await pageA.getByRole('button', { name: 'Join Match', exact: true }).click()
    await pageB.getByRole('button', { name: 'Join Match', exact: true }).click()

    // Badminton Singles is the only solo (no-team) format among Binangonan's
    // supported sports — no team is required, so both players can go
    // straight to matchmaking. Note: because the dev DB persists across
    // E2E runs (no reset between them — see other specs' comments), an
    // unrelated older open Badminton Singles request can still be sitting
    // in the pool and get consumed instantly, so "Looking for a match..."
    // isn't guaranteed here the way it would be against a clean database —
    // only that the request lands in the list one way or the other.
    await pageA.getByTestId('mm-sport').selectOption({ label: 'Badminton' })
    await pageA.getByTestId('mm-format').selectOption({ label: 'Singles' })
    await pageA.getByRole('button', { name: 'Find a match' }).click()
    await expect(pageA.getByText('Badminton — Singles').first()).toBeVisible()

    // Player B requests the same sport+format — this should pair them
    // server-side (either synchronously or, if Player A's request was
    // still open, via the matchmaking.{id} private channel without any
    // manual refresh on Player A's side).
    await pageB.getByTestId('mm-sport').selectOption({ label: 'Badminton' })
    await pageB.getByTestId('mm-format').selectOption({ label: 'Singles' })
    await pageB.getByRole('button', { name: 'Find a match' }).click()

    await expect(pageB.getByText('Matched!').first()).toBeVisible()
    await expect(pageA.getByText('Matched!').first()).toBeVisible({ timeout: 10000 })
  } finally {
    await contextA.close()
    await contextB.close()
  }
})

test('creating a match only offers venues that have a court for the chosen sport', async ({ page }) => {
  await loginAs(page, 'player@sporthub.test', 'password')
  await page.goto('/player')
  await page.getByRole('button', { name: 'Matchmaking', exact: true }).click()
  await page.getByRole('button', { name: 'Create Match', exact: true }).click()

  // Deliberately doesn't submit the form — this test's only job is to prove
  // the venue dropdown is filtered by sport, and actually creating a request
  // here would dump another entry into the shared, persistent-across-runs
  // Badminton Singles matchmaking pool that the real-time pairing test above
  // also draws from, causing it to occasionally match against this test's
  // leftover instead of its own intended opponent.
  await page.getByTestId('mm-sport').selectOption({ label: 'Pickleball' })
  await page.getByTestId('mm-format').selectOption({ label: 'Singles' })

  const venueSelect = page.getByTestId('mm-venue')
  // Seeded data: only JBTC Binangonan Badminton and Pickleball Courts has a
  // Pickleball court — the Binangonan Recreation and Conference Center
  // (Basketball + Volleyball + Table Tennis + Badminton, but no Pickleball,
  // in this seed) must not appear.
  await expect(venueSelect.locator('option', { hasText: 'JBTC Binangonan Badminton and Pickleball Courts' })).toHaveCount(1)
  await expect(venueSelect.locator('option', { hasText: 'Binangonan Recreation and Conference Center' })).toHaveCount(0)
})

test('a doubles match requires a full team, formed by inviting a friend', async ({ browser }) => {
  test.setTimeout(90000)

  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  try {
    const nameA = `E2E Captain ${Date.now()}`
    const nameB = `E2E Teammate ${Date.now()}`
    await registerPlayer(pageA, nameA)
    await registerPlayer(pageB, nameB)

    // Team invites are friends-only.
    await befriend(pageA, pageB, nameA, nameB)

    await pageA.goto('/player')
    await pageA.getByRole('button', { name: 'Matchmaking', exact: true }).click()
    await pageA.getByRole('button', { name: 'Manage teams', exact: true }).click()
    await pageA.getByRole('button', { name: '+ Create a team', exact: true }).click()

    await pageA.getByTestId('team-sport').selectOption({ label: 'Badminton' })
    // TeamPanel's format options include the per-side count in the label.
    await pageA.getByTestId('team-format').selectOption({ label: 'Doubles (2 per side)' })
    await pageA.getByRole('button', { name: 'Create team', exact: true }).click()

    // Team starts with only the captain accepted — 1 of the 2 Doubles slots.
    await expect(pageA.getByText('Forming (1/2)')).toBeVisible()

    // Before the roster is full, matchmaking must refuse to proceed.
    await pageA.getByTestId('mm-sport').selectOption({ label: 'Badminton' })
    await pageA.getByTestId('mm-format').selectOption({ label: 'Doubles' })
    await expect(pageA.getByRole('button', { name: 'Find a match' })).toBeDisabled()

    await pageA.getByTestId('team-invite-friend').selectOption({ label: nameB })
    await pageA.getByRole('button', { name: 'Invite', exact: true }).click()

    // Player B accepts the invite from their own Manage teams panel.
    await pageB.goto('/player')
    await pageB.getByRole('button', { name: 'Matchmaking', exact: true }).click()
    await pageB.getByRole('button', { name: 'Manage teams', exact: true }).click()
    await expect(pageB.getByText('invited you to')).toBeVisible({ timeout: 20000 })
    await pageB.getByRole('button', { name: 'Accept', exact: true }).click()

    // The team should flip to Ready, and matchmaking should unblock for the captain.
    await expect(pageA.getByText('Ready', { exact: true })).toBeVisible({ timeout: 20000 })

    await pageA.getByTestId('mm-team').selectOption({ label: `${nameA}'s Team` })
    await expect(pageA.getByRole('button', { name: 'Find a match' })).toBeEnabled()
    await pageA.getByRole('button', { name: 'Find a match' }).click()

    // Either outcome (still open, or instantly matched against a ready
    // Doubles team left over from an earlier local run) proves the point of
    // this test: a ready team unblocked matchmaking for a multi-player
    // format. The pairing algorithm itself is covered elsewhere.
    await expect(pageA.getByText('Badminton — Doubles').first()).toBeVisible({ timeout: 20000 })
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
