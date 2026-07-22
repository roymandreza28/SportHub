import { test, expect, request as playwrightRequest } from '@playwright/test'
import { loginAs } from './helpers'

const API = 'http://localhost:8000'

/**
 * Pure API session (no browser) used only to seed prerequisite data this
 * test doesn't otherwise exercise: registering 4 players into the
 * tournament is Coach territory (Milestone 7, already covered by its own
 * Pest tests) — this file's job is the organizer's bracket + scoreboard UI,
 * not re-proving coach registration end to end.
 */
async function apiLogin(email: string, password: string) {
  const context = await playwrightRequest.newContext({ baseURL: API })
  await context.get('/sanctum/csrf-cookie', {
    headers: { Origin: 'http://localhost:5173', Referer: 'http://localhost:5173/' },
  })
  const cookies = await context.storageState()
  const xsrf = cookies.cookies.find((c) => c.name === 'XSRF-TOKEN')?.value
  await context.post('/api/login', {
    data: { email, password },
    headers: {
      'X-XSRF-TOKEN': decodeURIComponent(xsrf ?? ''),
      Origin: 'http://localhost:5173',
      Referer: 'http://localhost:5173/',
    },
  })
  return context
}

test('organizer generates a bracket, scores every match through to completion, and sees live updates', async ({ page }) => {
  test.setTimeout(60000)

  const organizerApi = await apiLogin('organizer@sporthub.test', 'password')
  const coachApi = await apiLogin('coach@sporthub.test', 'password')

  const tournamentName = `E2E Cup ${Date.now()}`

  await loginAs(page, 'organizer@sporthub.test', 'password')
  await page.goto('/organizer')

  await page.getByRole('combobox').first().selectOption({ label: 'Basketball' })
  await page.getByPlaceholder('Tournament name').fill(tournamentName)
  await page.getByRole('combobox').nth(1).selectOption('single_elimination')
  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)
  await page.locator('input[type="datetime-local"]').fill(startsAt)
  await page.getByRole('button', { name: 'Create tournament' }).click()

  await expect(page.getByText(/Created ".*" as a draft\. Register players/)).toBeVisible()
  const tournamentButton = page.locator('button', { hasText: tournamentName })
  await expect(tournamentButton).toBeVisible()

  const cookies = await organizerApi.storageState()
  const xsrf = decodeURIComponent(cookies.cookies.find((c) => c.name === 'XSRF-TOKEN')?.value ?? '')
  const authHeaders = { 'X-XSRF-TOKEN': xsrf, Origin: 'http://localhost:5173', Referer: 'http://localhost:5173/' }

  const list = await organizerApi.get('/api/tournaments', { headers: authHeaders })
  const tournament = (await list.json()).find((t: { name: string }) => t.name === tournamentName)
  expect(tournament).toBeTruthy()

  await organizerApi.patch(`/api/tournaments/${tournament.id}`, {
    data: { status: 'open' },
    headers: authHeaders,
  })

  const coachCookies = await coachApi.storageState()
  const coachXsrf = decodeURIComponent(coachCookies.cookies.find((c) => c.name === 'XSRF-TOKEN')?.value ?? '')
  const coachHeaders = { 'X-XSRF-TOKEN': coachXsrf, Origin: 'http://localhost:5173', Referer: 'http://localhost:5173/' }

  for (const email of ['player@sporthub.test', 'player2@sporthub.test']) {
    const search = await coachApi.get(`/api/players?search=${email}`, { headers: coachHeaders })
    const [found] = await search.json()
    await coachApi.post(`/api/tournaments/${tournament.id}/registrations`, {
      data: { user_id: found.id },
      headers: coachHeaders,
    })
  }

  await tournamentButton.click()
  const generateButton = page.getByRole('button', { name: /Generate bracket for tournament/ })
  await expect(generateButton).toBeVisible()
  await generateButton.click()
  await expect(page.getByText('Bracket generated!')).toBeVisible()

  // 2 players, single elimination -> exactly one match, the final, with both
  // participant slots already filled (shown as "#<id>" since names aren't
  // eager-loaded on this endpoint) — so match on its "scheduled" status text
  // rather than a placeholder that never renders here.
  const matchCard = page.locator('button', { hasText: 'scheduled' }).first()
  await expect(matchCard).toBeVisible()
  await matchCard.click()

  await expect(page.getByText(/Scoreboard — Match #/)).toBeVisible()
  const scoreInputs = page.locator('input[type="number"]')
  await scoreInputs.nth(0).fill('21')
  await scoreInputs.nth(1).fill('15')
  await page.getByRole('button', { name: 'Finish match' }).click()

  // The public match channel push should reflect the final score without a manual refresh.
  await expect(page.getByText(/Live: 21 - 15/)).toBeVisible({ timeout: 10000 })

  const finalTournament = await organizerApi.get(`/api/tournaments/${tournament.id}`, { headers: authHeaders })
  expect((await finalTournament.json()).status).toBe('completed')

  await organizerApi.dispose()
  await coachApi.dispose()
})
