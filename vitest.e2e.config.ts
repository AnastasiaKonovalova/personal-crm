import { defineConfig } from "vitest/config";

// HTTP checks against a running app; the database connection is used only for counts and cleanup
try {
  process.loadEnvFile(".env");
} catch {
  // DATABASE_URL may already be set in the environment
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.e2e.ts"],
    fileParallelism: false,
  },
});
