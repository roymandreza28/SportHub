import type { Page } from '@playwright/test'

export async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  // /dashboard is a transient redirect target now (it immediately forwards
  // to the account's actual role page), so waiting on that exact path is
  // flaky — the URL can pass through it faster than polling reliably
  // catches. Wait for any real authenticated landing page instead.
  await page.waitForURL(/\/(dashboard|admin|facilitator|player|coach|organizer)/)
}

/**
 * Authenticated API call reusing the browser context's session cookie —
 * mirrors what our axios client does (Sanctum needs the XSRF-TOKEN cookie
 * echoed back as a header on unsafe methods). Used only for test setup
 * steps that have no corresponding UI yet (e.g. no "open registration"
 * button exists on the tournament wizard).
 */
export async function apiRequest(
  page: Page,
  method: 'POST' | 'PATCH',
  path: string,
  data: Record<string, unknown>
) {
  const cookies = await page.context().cookies()
  const xsrf = cookies.find((c) => c.name === 'XSRF-TOKEN')?.value
  if (!xsrf) throw new Error('No XSRF-TOKEN cookie found — log in first')

  return page.request.fetch(`http://localhost:8000${path}`, {
    method,
    data,
    headers: {
      'X-XSRF-TOKEN': decodeURIComponent(xsrf),
      Accept: 'application/json',
      Origin: 'http://localhost:5173',
      Referer: 'http://localhost:5173/',
    },
  })
}
