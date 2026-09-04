import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test('a facilitator adds a single court with a sport and sets operating hours', async ({ page }) => {
  await loginAs(page, 'venue_facilitator@sporthub.test', 'password')
  await page.goto('/facilitator')
  await page.getByRole('button', { name: 'Venues', exact: true }).click()

  const venueName = `E2E Venue ${Date.now()}`

  await page.getByRole('button', { name: '+ Create Venue', exact: true }).click()

  await page.getByLabel('Name').fill(venueName)
  await page.getByLabel('Address / Location').fill('Brgy. San Carlos, Binangonan, Rizal')

  // "Add a single court": name + sport chips, one court at a time.
  await page.getByPlaceholder('Court name (optional)').fill('Main Court')
  await page.getByTestId('single-court-sports').getByRole('button', { name: 'Basketball', exact: true }).click()
  await page.getByRole('button', { name: '+ Add court', exact: true }).click()

  await expect(page.getByText('Main Court — Basketball')).toBeVisible()

  await page.getByLabel('Opens at').fill('09:00')
  await page.getByLabel('Closes at').fill('17:00')

  await page.getByRole('button', { name: 'Create venue', exact: true }).click()

  // The modal closes on success; the facilitator's seeded account already
  // owns other venues, so find the new one by name in the venue list rather
  // than assuming it's first/selected.
  const venueRow = page.locator('li', { hasText: venueName })
  await expect(venueRow).toBeVisible({ timeout: 10000 })
  await expect(venueRow.getByText('1 court')).toBeVisible()

  // Court names/sports are only shown in the courts & equipment manager
  // embedded inside the Edit modal, not on the list row.
  await venueRow.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByText('Main Court')).toBeVisible()
})

test('a facilitator adds multiple courts that all share the same two sports in one step', async ({ page }) => {
  await loginAs(page, 'venue_facilitator@sporthub.test', 'password')
  await page.goto('/facilitator')
  await page.getByRole('button', { name: 'Venues', exact: true }).click()

  const venueName = `E2E Shared Courts ${Date.now()}`

  await page.getByRole('button', { name: '+ Create Venue', exact: true }).click()
  await page.getByLabel('Name').fill(venueName)
  await page.getByLabel('Address / Location').fill('Brgy. San Carlos, Binangonan, Rizal')

  // "Add multiple courts that share sports": pick Tennis + Pickleball (a
  // real-world combo — pickleball is commonly played on lined tennis
  // courts), set a count, and both created courts should carry both sports.
  const sharedChips = page.getByTestId('shared-court-sports')
  await sharedChips.getByRole('button', { name: 'Tennis', exact: true }).click()
  await sharedChips.getByRole('button', { name: 'Pickleball', exact: true }).click()
  await page.getByLabel('Number of courts').fill('2')
  await page.getByRole('button', { name: '+ Add 2 shared courts', exact: true }).click()

  // Join order isn't guaranteed, so match on both sport names being present
  // rather than an exact joined string. Scoped to the modal — the venue
  // list dimmed behind it can contain leftover venues from earlier runs
  // that would otherwise also match "Tennis" + "Pickleball".
  const modal = page.getByTestId('create-venue-modal')
  const courtEntries = modal.locator('li').filter({ hasText: 'Tennis' }).filter({ hasText: 'Pickleball' })
  await expect(courtEntries).toHaveCount(2)

  await page.getByRole('button', { name: 'Create venue', exact: true }).click()

  const venueRow = page.locator('li', { hasText: venueName })
  await expect(venueRow).toBeVisible({ timeout: 10000 })
  await expect(venueRow.getByText('2 courts')).toBeVisible()

  await venueRow.getByRole('button', { name: 'Edit', exact: true }).click()
  const editModal = page.getByTestId('edit-venue-modal')
  const editedCourtEntries = editModal.locator('li').filter({ hasText: 'Tennis' }).filter({ hasText: 'Pickleball' })
  await expect(editedCourtEntries).toHaveCount(2)

  // Both created courts are independently discoverable by either sport, so
  // this venue must show up in a Tennis-only AND a Pickleball-only search.
  const [tennisId, pickleballId] = await Promise.all([
    page.request.get('http://localhost:8000/api/sports').then(async (r) => {
      const sports = (await r.json()) as { id: number; name: string }[]
      return sports.find((s) => s.name === 'Tennis')!.id
    }),
    page.request.get('http://localhost:8000/api/sports').then(async (r) => {
      const sports = (await r.json()) as { id: number; name: string }[]
      return sports.find((s) => s.name === 'Pickleball')!.id
    }),
  ])
  const byTennis = await (await page.request.get(`http://localhost:8000/api/venues?sport_id=${tennisId}`)).json()
  const byPickleball = await (await page.request.get(`http://localhost:8000/api/venues?sport_id=${pickleballId}`)).json()
  expect((byTennis as { name: string }[]).map((v) => v.name)).toContain(venueName)
  expect((byPickleball as { name: string }[]).map((v) => v.name)).toContain(venueName)
})

test('a facilitator can deactivate a venue, hiding it from the player directory', async ({ page }) => {
  await loginAs(page, 'venue_facilitator@sporthub.test', 'password')
  await page.goto('/facilitator')
  await page.getByRole('button', { name: 'Venues', exact: true }).click()

  const venueName = `E2E Deactivate ${Date.now()}`

  await page.getByRole('button', { name: '+ Create Venue', exact: true }).click()
  await page.getByLabel('Name').fill(venueName)
  await page.getByLabel('Address / Location').fill('Brgy. San Carlos, Binangonan, Rizal')
  await page.getByRole('button', { name: 'Create venue', exact: true }).click()

  const venueRow = page.locator('li', { hasText: venueName })
  await expect(venueRow).toBeVisible({ timeout: 10000 })

  // Still visible to the facilitator's own list...
  await venueRow.getByRole('button', { name: 'Deactivate', exact: true }).click()
  await expect(venueRow.getByText('Inactive')).toBeVisible()

  // ...but gone from the public directory the player-facing app reads from.
  // Checked directly via the public API (no auth needed) rather than
  // switching to a player session, since venue_facilitator and player are
  // different logged-in roles and this endpoint is intentionally public.
  const publicVenues = await page.request.get('http://localhost:8000/api/venues')
  const names = (await publicVenues.json()) as { name: string }[]
  expect(names.map((v) => v.name)).not.toContain(venueName)
})

test('a facilitator can delete a venue, removing it from their own list', async ({ page }) => {
  await loginAs(page, 'venue_facilitator@sporthub.test', 'password')
  await page.goto('/facilitator')
  await page.getByRole('button', { name: 'Venues', exact: true }).click()

  const venueName = `E2E Delete ${Date.now()}`

  await page.getByRole('button', { name: '+ Create Venue', exact: true }).click()
  await page.getByLabel('Name').fill(venueName)
  await page.getByLabel('Address / Location').fill('Brgy. San Carlos, Binangonan, Rizal')
  await page.getByRole('button', { name: 'Create venue', exact: true }).click()

  const venueRow = page.locator('li', { hasText: venueName })
  await expect(venueRow).toBeVisible({ timeout: 10000 })

  page.once('dialog', (dialog) => dialog.accept())
  await venueRow.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(page.locator('li', { hasText: venueName })).toHaveCount(0)
})
