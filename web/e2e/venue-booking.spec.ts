import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test('a player can browse venues, book an available slot, and see it as pending', async ({ page }) => {
  await loginAs(page, 'player@sporthub.test', 'password')

  await page.goto('/player')
  // Each sidebar item now shows its own content instead of one long
  // scrollable page — switch to the Venues tab first.
  await page.getByRole('button', { name: 'Venues', exact: true }).click()

  // Pick the first venue in the directory list.
  const firstVenueButton = page.locator('ul button', { hasText: '—' }).first()
  await expect(firstVenueButton).toBeVisible()
  const venueName = (await firstVenueButton.textContent())?.split('—')[0].trim()
  await firstVenueButton.click()

  await expect(page.getByText(`Book ${venueName}`)).toBeVisible()

  // Move to tomorrow first so every half-hour mark is guaranteed to be in the
  // future regardless of what time it actually is right now — picking a slot
  // on "today" risked landing on a time-of-day that's already passed,
  // which the backend correctly rejects ("starts_at must be after now").
  await page.getByRole('button', { name: 'Next day' }).click()

  // Click a slot unlikely to collide with other runs' bookings: a fixed hour
  // would eventually collide with an earlier run's own booking on repeat runs
  // against a persistent dev DB (no reset between E2E runs), so derive one
  // from the current timestamp instead of hardcoding one. Picked from
  // whatever slot lanes are actually rendered — not assumed to span the
  // full 24h day — since a venue with operating hours set constrains the
  // calendar to slotMinTime/slotMaxTime, shrinking the rendered range.
  const slotLanes = page.locator('.fc-timegrid-slot-lane[data-time]')
  const slotCount = await slotLanes.count()
  const slot = slotLanes.nth(Date.now() % slotCount)
  await slot.scrollIntoViewIfNeeded()
  await slot.click()

  const requestButton = page.getByRole('button', { name: 'Request booking' })
  await expect(requestButton).toBeVisible()
  await requestButton.click()

  await expect(page.getByText('Booking requested — waiting on facilitator approval.')).toBeVisible()

  // Confirm it now shows up in "My bookings" with pending status.
  await page.getByRole('button', { name: 'Bookings', exact: true }).click()
  await expect(page.locator('text=pending').first()).toBeVisible()
})
