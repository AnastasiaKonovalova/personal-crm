import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Applies pending migrations from ./drizzle. In production it runs as a one-off container
// before the new app starts (see deploy/deploy.sh); locally `pnpm db:migrate` runs this same file.
// Plain Node runs this file directly (type stripping), so imports stay free of path aliases and of
// other project files: the image holds only this file next to ./drizzle.
//
// Migration 0003 gives the existing contacts and groups to the owner. It reads the owner's email from
// the `app.owner_email` setting of its connection, and this file sets that from OWNER_EMAIL.
// The email is never logged.

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Postgres startup options are `-c name=value` split on whitespace: a backslash and whitespace in the value
// need a backslash in front. Same as `ownerOptions` in tests/migration-on-data.test.ts
const ownerEmail = process.env.OWNER_EMAIL;
const options =
  ownerEmail === undefined
    ? undefined
    : `-c app.owner_email=${ownerEmail.replace(/[\\\s]/g, "\\$&")}`;

const pool = new Pool({ connectionString, max: 1, options });
try {
  await migrate(drizzle({ client: pool }), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied");
} finally {
  await pool.end();
}
