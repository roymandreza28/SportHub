import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test('a new user can register, land on the dashboard, and log out', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`

  await page.goto('/register')
  await page.getByPlaceholder('Name').fill('E2E Test User')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password', { exact: true }).fill('password123')
  await page.getByPlaceholder('Confirm password').fill('password123')
  await page.getByRole('button', { name: 'Register' }).click()

  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByText(email)).toBeVisible()
  // Self-registration defaults to the player role.
  await expect(page.getByText('Roles: player')).toBeVisible()

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/login/)
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
