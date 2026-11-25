import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

// The limit of 3 sign-in emails per address in 10 minutes counts emails that went out: a request takes its
// place in the limit before the email is sent, and gives it back when the send fails (backlog: concurrent
// requests bypass the limit; owner's decision 2026-11-25). Real database from .env; the send fails for real:
// nothing listens on SMTP port 1. The address is fictional and unique; the test removes its own rows.

const email = `limit-fail-${randomUUID().slice(0, 8)}@example.test`;

async function withPool<T>(run: (pool: Pool) => Promise<T>) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

async function loginEmailRows() {
  const { rows } = await withPool((pool) =>
    pool.query<{ total: number }>(
      "select count(*)::int as total from login_emails where email = $1",
      [email],
    ),
  );
  return rows[0].total;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

afterAll(async () => {
  await withPool(async (pool) => {
    await pool.query("delete from login_emails where email = $1", [email]);
    await pool.query("delete from verifications where value = $1", [
      JSON.stringify({ type: "magic-link", email }),
    ]);
  });
});

describe("the limit of sign-in emails", { timeout: 15_000 }, () => {
  it("gives the place back when the email is not sent", async () => {
    vi.stubEnv("SMTP_PORT", "1");
    vi.resetModules();
    const { getAuth } = await import("@/server/auth");
    vi.spyOn(console, "error").mockImplementation(() => {});

    for (let n = 0; n < 4; n += 1) {
      await expect(
        getAuth().api.signInMagicLink({ body: { email }, headers: new Headers() }),
      ).rejects.toThrow();
    }

    expect(await loginEmailRows()).toBe(0);
  });
});
