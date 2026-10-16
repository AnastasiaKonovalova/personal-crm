import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

// One pool per process, reused across hot reloads in development
const globalForDb = globalThis as unknown as { pool?: Pool; db?: Db };

export function getDb(): Db {
  if (!globalForDb.db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set: fill it in .env");
    }
    globalForDb.pool = new Pool({ connectionString });
    globalForDb.db = drizzle({ client: globalForDb.pool, schema });
  }
  return globalForDb.db;
}

export async function closeDb() {
  await globalForDb.pool?.end();
  globalForDb.pool = undefined;
  globalForDb.db = undefined;
}
