import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { createTestUser } from "./helpers/test-user";

// The helper the integration tests use to get their own user and to clean up after themselves

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

afterAll(() => pool.end());

describe("createTestUser", () => {
  it("creates users with unique fictional emails", async () => {
    const first = await createTestUser();
    const second = await createTestUser();
    try {
      expect(first.id).not.toBe(second.id);
      expect(first.email).toMatch(/^[^@\s]+@example\.test$/);
      expect(first.email).not.toBe(second.email);

      const { rows } = await pool.query<{ email: string }>(
        "select email from users where id = any($1)",
        [[first.id, second.id]],
      );
      expect(rows.map((row) => row.email).sort()).toEqual([first.email, second.email].sort());
    } finally {
      await first.remove();
      await second.remove();
    }
  });

  it("removes the user with their contacts, notes, groups and memberships and leaves other users alone", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    try {
      const contact = await pool.query<{ id: string }>(
        "insert into contacts (user_id, name) values ($1, 'Проверка помощника') returning id",
        [user.id],
      );
      const contactId = contact.rows[0].id;
      await pool.query("insert into notes (contact_id, body) values ($1, 'Заметка')", [contactId]);
      const group = await pool.query<{ id: string }>(
        "insert into groups (user_id, name) values ($1, 'Группа помощника') returning id",
        [user.id],
      );
      await pool.query("insert into contact_groups (contact_id, group_id) values ($1, $2)", [
        contactId,
        group.rows[0].id,
      ]);
      await pool.query("insert into contacts (user_id, name) values ($1, 'Контакт другого')", [
        other.id,
      ]);

      await user.remove();

      const { rows } = await pool.query(
        `select
           (select count(*)::int from users where id = $1) as users,
           (select count(*)::int from contacts where user_id = $1) as contacts,
           (select count(*)::int from notes where contact_id = $2) as notes,
           (select count(*)::int from groups where user_id = $1) as groups,
           (select count(*)::int from contact_groups where contact_id = $2) as memberships,
           (select count(*)::int from contacts where user_id = $3) as "otherContacts"`,
        [user.id, contactId, other.id],
      );
      expect(rows[0]).toEqual({
        users: 0,
        contacts: 0,
        notes: 0,
        groups: 0,
        memberships: 0,
        otherContacts: 1,
      });
    } finally {
      await other.remove();
      // A second removal of the same user is harmless
      await user.remove();
    }
  });
});
