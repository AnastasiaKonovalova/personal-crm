import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read .env on its own
try {
  process.loadEnvFile(".env");
} catch {
  // DATABASE_URL may already be set in the environment; `generate` does not need it at all
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
