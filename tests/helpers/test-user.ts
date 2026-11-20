import { randomUUID } from "node:crypto";
import { Pool } from "pg";

// A user a test creates for itself: tests never rely on the users or the data already in the database
// (CI starts with an empty one). The email is fictional and unique. `remove()` deletes the user with
// everything that belongs to them and can be called more than once.

async function withSeparateConnection<T>(run: (pool: Pool) => Promise<T>) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

export async function createTestUser() {
  const id = `test-${randomUUID()}`;
  const email = `${randomUUID().slice(0, 8)}@example.test`;
  await withSeparateConnection((pool) =>
    pool.query("insert into users (id, name, email, email_verified) values ($1, '', $2, true)", [
      id,
      email,
    ]),
  );

  const remove = () =>
    withSeparateConnection(async (pool) => {
      // contacts and groups reference the user with RESTRICT, so they go first: notes and memberships
      // follow by cascade, sessions and accounts go with the user
      await pool.query("delete from contacts where user_id = $1", [id]);
      await pool.query("delete from groups where user_id = $1", [id]);
      await pool.query("delete from login_emails where email = $1", [email]);
      await pool.query("delete from users where id = $1", [id]);
    });

  return { id, email, remove };
}

export type TestUser = Awaited<ReturnType<typeof createTestUser>>;
