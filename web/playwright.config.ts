import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  // php artisan serve has no worker concurrency on Windows (that needs POSIX
  // fork), so it handles requests strictly one at a time. Session-establishing
  // requests on page load plus a real API call can take several seconds
  // longer than default timeouts allow — bump both to match.
  timeout: 40000,
  expect: { timeout: 10000 },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
