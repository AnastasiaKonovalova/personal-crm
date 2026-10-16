import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/db";
import { contactSchema } from "@/lib/validation";
import {
  PAGE_SIZE,
  addNote,
  createContact,
  getContactWithNotes,
  listContacts,
} from "@/server/contacts";

// Integration tests against the real database from .env (the success criteria from the spec)

const marker = randomUUID().slice(0, 8);
const testName = `Тестовый Контакт ${marker}`;
const noteText = `Созвонились, договорились о встрече ${marker}`;
let createdId: string | undefined;

async function withSeparateConnection<T>(run: (pool: Pool) => Promise<T>) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

afterAll(async () => {
  if (createdId) {
    // Remove only the contact this test created; its notes go away via ON DELETE CASCADE
    await withSeparateConnection((pool) =>
      pool.query("delete from contacts where id = $1", [createdId]),
    );
  }
  await closeDb();
});

describe("contact list", () => {
  it("pages through every contact in the database", async () => {
    const first = await listContacts({ page: 1 });
    const seen = new Set(first.items.map((contact) => contact.id));
    for (let page = 2; page <= first.pageCount; page += 1) {
      const next = await listContacts({ page });
      expect(next.items.length).toBeLessThanOrEqual(PAGE_SIZE);
      next.items.forEach((contact) => seen.add(contact.id));
    }

    const { rows } = await withSeparateConnection((pool) =>
      pool.query<{ total: number }>("select count(*)::int as total from contacts"),
    );
    expect(first.total).toBe(rows[0].total);
    expect(seen.size).toBe(rows[0].total);
  });

  it("treats LIKE wildcards in the search query literally", async () => {
    const result = await listContacts({ query: "%", page: 1 });
    expect(result.items.every((contact) => contact.name.includes("%"))).toBe(true);
  });
});

describe("main scenario: add → find by name → add note → saved", () => {
  it("adds a contact and finds it by part of the name in a different case", async () => {
    createdId = await createContact(
      contactSchema.parse({
        name: testName,
        about: "Проверка сценария",
        howWeMet: "Автотест",
        phone: "+7 (000) 000-00-00",
        email: "test@example.com",
      }),
    );

    const found = await listContacts({ query: `КОНТАКТ ${marker}`.toUpperCase(), page: 1 });
    expect(found.items.map((contact) => contact.id)).toEqual([createdId]);
  });

  it("adds a note that is visible through a separate connection and on the card", async () => {
    expect(createdId).toBeDefined();
    const note = await addNote(createdId!, noteText);
    expect(note?.body).toBe(noteText);

    // A separate connection stands in for "another browser": the data lives in the database
    const { rows } = await withSeparateConnection((pool) =>
      pool.query<{ body: string }>("select body from notes where contact_id = $1", [createdId]),
    );
    expect(rows.map((row) => row.body)).toEqual([noteText]);

    const card = await getContactWithNotes(createdId!);
    expect(card?.contact.name).toBe(testName);
    expect(card?.notes.map((item) => item.body)).toEqual([noteText]);
  });

  it("does not add a note to a missing contact", async () => {
    expect(await addNote(randomUUID(), "Текст")).toBeNull();
    expect(await addNote("not-a-uuid", "Текст")).toBeNull();
    expect(await getContactWithNotes("not-a-uuid")).toBeNull();
  });
});
