import { defineConfig, devices } from "@playwright/test";

// Browser e2e against a running app (`pnpm build && pnpm start`); the database connection
// is used only for counts and cleanup
try {
  process.loadEnvFile(".env");
} catch {
  // DATABASE_URL may already be set in the environment
}

export default defineConfig({
  testDir: "tests/browser",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
