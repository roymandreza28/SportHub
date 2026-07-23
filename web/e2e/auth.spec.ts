import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test('a new user can register, land straight on their role dashboard, and log out to the landing page', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`

  await page.goto('/register')
  await page.getByPlaceholder('Name').fill('E2E Test User')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password', { exact: true }).fill('password123')
  await page.getByPlaceholder('Confirm password').fill('password123')
  await page.getByRole('button', { name: 'Register' }).click()

  // Self-registration defaults to the player role, and there's no role
  // picker anymore — /dashboard forwards straight to /player.
  await expect(page).toHaveURL(/\/player/)
  await expect(page.getByText('E2E Test User')).toBeVisible()

  await page.getByRole('button', { name: 'Logout' }).click()
  // Logout returns to the landing page, not /login.
  await expect(page).toHaveURL(/^http:\/\/localhost:5173\/$/)
})

test('login rejects wrong credentials and succeeds with the right ones', async ({ page }) => {
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill('player@sporthub.test')
  await page.getByPlaceholder('Password').fill('wrong-password')
  await page.getByRole('button', { name: 'Log in' }).click()

  await expect(page.getByText('Invalid credentials.')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)

  await loginAs(page, 'player@sporthub.test', 'password')
  await expect(page.getByText('Pat Player')).toBeVisible()
})

test('an unauthenticated visitor hitting a protected route is redirected to login', async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/player')
  await expect(page).toHaveURL(/\/login/)
})
