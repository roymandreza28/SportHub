import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test('a player can browse venues, book an available slot, and see it as pending', async ({ page }) => {
  await loginAs(page, 'player@sporthub.test', 'password')

  await page.goto('/player')

  // Pick the first venue in the directory list.
  const firstVenueButton = page.locator('ul button', { hasText: '—' }).first()
  await expect(firstVenueButton).toBeVisible()
  const venueName = (await firstVenueButton.textContent())?.split('—')[0].trim()
  await firstVenueButton.click()

  await expect(page.getByText(`Book ${venueName}`)).toBeVisible()

  // Click a slot unlikely to collide with other runs' bookings: a fixed hour
  // would eventually collide with an earlier run's own booking on repeat runs
  // against a persistent dev DB (no reset between E2E runs), so derive one of
  // the 48 half-hour marks for the currently visible day from the current
  // timestamp instead of hardcoding one.
  const slotIndex = Date.now() % 48
  const slotTime = `${String(Math.floor(slotIndex / 2)).padStart(2, '0')}:${slotIndex % 2 === 0 ? '00' : '30'}:00`
  const slot = page.locator(`.fc-timegrid-slot-lane[data-time="${slotTime}"]`).first()
  await slot.scrollIntoViewIfNeeded()
  await slot.click()

  const requestButton = page.getByRole('button', { name: 'Request booking' })
  await expect(requestButton).toBeVisible()
  await requestButton.click()

  await expect(page.getByText('Booking requested — waiting on facilitator approval.')).toBeVisible()

  // Confirm it now shows up in "My bookings" with pending status.
  await expect(page.locator('text=pending').first()).toBeVisible()
})
