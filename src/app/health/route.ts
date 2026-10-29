import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

// Smoke check for deploys: the app is up and reaches the database
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch (error) {
    console.error("Health check: database is unavailable", error);
    return Response.json({ status: "db_unavailable" }, { status: 503 });
  }
}
