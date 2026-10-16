import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests talk to the real database from .env
try {
  process.loadEnvFile(".env");
} catch {
  // DATABASE_URL may already be set in the environment
}

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
  },
});
