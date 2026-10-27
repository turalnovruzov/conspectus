import { defineConfig, devices } from '@playwright/test'
import { testDatabaseUrl } from './src/db/throwaway'

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: true,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'node scripts/test-db.ts prepare --seed && npm run build && npm run start -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    env: { DATABASE_URL: testDatabaseUrl(), CONSPECTUS_ENV_FILE: '/nonexistent/conspectus.env' },
    timeout: 180_000,
  },
})
