import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test('a facilitator browses bookings per venue, approves one, and views it on that venues schedule', async ({ browser }) => {
  test.setTimeout(60000)

  const facilitatorContext = await browser.newContext()
  const playerContext = await browser.newContext()
  const facilitatorPage = await facilitatorContext.newPage()
  const playerPage = await playerContext.newPage()

  try {
    const venueName = `E2E Bookings Venue ${Date.now()}`

    // Facilitator creates a fresh, isolated venue with one court so this
    // test doesn't depend on (or get confused by) whatever other venues and
    // bookings already exist in the persistent dev DB.
    await loginAs(facilitatorPage, 'venue_facilitator@sporthub.test', 'password')
    await facilitatorPage.goto('/facilitator')
    await facilitatorPage.getByRole('button', { name: 'Venues', exact: true }).click()
    await facilitatorPage.getByRole('button', { name: '+ Create Venue', exact: true }).click()
    await facilitatorPage.getByLabel('Name').fill(venueName)
    await facilitatorPage.getByLabel('Address / Location').fill('Brgy. San Juan, Morong, Rizal')
    await facilitatorPage.getByPlaceholder('Court name (optional)').fill('Court 1')
    await facilitatorPage.getByRole('button', { name: '+ Add court', exact: true }).click()
    await facilitatorPage.getByRole('button', { name: 'Create venue', exact: true }).click()
    await expect(facilitatorPage.locator('li', { hasText: venueName })).toBeVisible({ timeout: 10000 })

    // Player books a slot at exactly this venue (searched by name, not
    // "first in directory", since other tests create venues concurrently).
    await loginAs(playerPage, 'player@sporthub.test', 'password')
    await playerPage.goto('/player')
    await playerPage.getByRole('button', { name: 'Venues', exact: true }).click()
    await playerPage.getByPlaceholder('Search venues').fill(venueName)
    await playerPage.getByRole('button', { name: new RegExp(venueName) }).click()
    await expect(playerPage.getByText(`Book ${venueName}`)).toBeVisible()

    await playerPage.getByRole('button', { name: 'Next day' }).click()
    const slotLanes = playerPage.locator('.fc-timegrid-slot-lane[data-time]')
    const slotCount = await slotLanes.count()
    const slot = slotLanes.nth(Date.now() % slotCount)
    await slot.scrollIntoViewIfNeeded()
    await slot.click()
    await playerPage.getByRole('button', { name: 'Request booking' }).click()
    await expect(playerPage.getByText('Booking requested — waiting on facilitator approval.')).toBeVisible()

    // Facilitator's Bookings tab: the venue list shows this venue with the
    // pending count, drilling in shows the actual booking with actions.
    await facilitatorPage.getByRole('button', { name: 'Bookings', exact: true }).click()
    const venueRow = facilitatorPage.locator('li', { hasText: venueName })
    await expect(venueRow.getByText('1 pending')).toBeVisible({ timeout: 10000 })
    await expect(venueRow.getByText('1 booking')).toBeVisible()

    await venueRow.getByRole('button').click()
    await expect(facilitatorPage.getByText(`Every booking at ${venueName}`)).toBeVisible()
    await expect(facilitatorPage.getByText('Pat Player - Court 1')).toBeVisible()
    await facilitatorPage.getByRole('button', { name: 'Approve', exact: true }).click()

    // Approved bookings show a status badge instead of Approve/Reject.
    await expect(facilitatorPage.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0)
    await expect(facilitatorPage.getByText('approved', { exact: true })).toBeVisible()

    // Back to the venue list, the pending count should have dropped to 0.
    await facilitatorPage.getByRole('button', { name: '← Back to venues', exact: true }).click()
    await expect(facilitatorPage.locator('li', { hasText: venueName }).getByText('pending')).toHaveCount(0)

    // Schedule tab: picking this venue from the dropdown shows the approved
    // booking on its calendar.
    await facilitatorPage.getByRole('button', { name: 'Schedule', exact: true }).click()
    await facilitatorPage.locator('select').selectOption({ label: venueName })
    // The booking was made for "tomorrow" (player flow always books a day
    // ahead) — the calendar defaults to today's view, so advance it once.
    await facilitatorPage.getByRole('button', { name: 'Next day' }).click()
    await expect(facilitatorPage.getByText('Pat Player - Court 1')).toBeVisible()
  } finally {
    await facilitatorContext.close()
    await playerContext.close()
  }
})
