import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Applies pending migrations from ./drizzle. In production it runs as a one-off container
// before the new app starts (see deploy/deploy.sh); locally `pnpm db:migrate` does the same via drizzle-kit.
// Plain Node runs this file directly (type stripping), so imports stay free of path aliases.

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString, max: 1 });
try {
  await migrate(drizzle({ client: pool }), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied");
} finally {
  await pool.end();
}
