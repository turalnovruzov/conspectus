import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: true,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npm run build && npm run start -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
