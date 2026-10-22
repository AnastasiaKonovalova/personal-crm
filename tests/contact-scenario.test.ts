import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db";
import { contactSchema, type ContactInput } from "@/lib/validation";
import {
  PAGE_SIZE,
  addNote,
  createContact,
  getContactWithNotes,
  listContacts,
  updateContact,
  updateNote,
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

describe("search treats «е» and «ё» as the same letter", () => {
  it("finds a name written with «е» by a query with «ё»", async () => {
    expect(createdId).toBeDefined();
    // testName is "Тестовый Контакт …" — written with «е»
    const found = await listContacts({ query: `тёстовый контакт ${marker}`, page: 1 });
    expect(found.items.map((contact) => contact.id)).toEqual([createdId]);
  });

  it("finds a name written with «ё» by a query with «е» and with «ё»", async () => {
    expect(createdId).toBeDefined();
    await updateContact(
      createdId!,
      contactSchema.parse({ name: `Фёдоров ${marker}`, about: "", howWeMet: "", phone: "", email: "" }),
    );

    for (const query of [`Федоров ${marker}`, `федоров ${marker}`, `ФЁДОРОВ ${marker}`]) {
      const found = await listContacts({ query, page: 1 });
      expect(found.items.map((contact) => contact.id)).toEqual([createdId]);
    }
  });
});

describe("editing", () => {
  it("updates every field of the contact", async () => {
    expect(createdId).toBeDefined();
    const input = contactSchema.parse({
      name: `${testName} изменён`,
      about: "Новое описание",
      howWeMet: "",
      phone: "+7 (111) 111-11-11",
      email: "edited@example.com",
    });
    expect(await updateContact(createdId!, input)).toBe(createdId);

    const card = await getContactWithNotes(createdId!);
    expect(card?.contact).toMatchObject(input);
    expect(card?.contact.howWeMet).toBeNull();
  });

  it("does not update a missing contact", async () => {
    const input = contactSchema.parse({ name: "Никто", about: "", howWeMet: "", phone: "", email: "" });
    expect(await updateContact(randomUUID(), input)).toBeNull();
    expect(await updateContact("not-a-uuid", input)).toBeNull();
  });

  it("updates a note of the contact and only of that contact", async () => {
    expect(createdId).toBeDefined();
    const card = await getContactWithNotes(createdId!);
    const noteId = card!.notes[0].id;
    const editedText = `Перенесли встречу ${marker}`;

    expect(await updateNote(randomUUID(), noteId, editedText)).toBeNull();
    expect(await updateNote(createdId!, randomUUID(), editedText)).toBeNull();

    const note = await updateNote(createdId!, noteId, editedText);
    expect(note?.body).toBe(editedText);
    const after = await getContactWithNotes(createdId!);
    expect(after?.notes.map((item) => item.body)).toEqual([editedText]);
  });
});

describe("failed writes keep personal data out of logs", () => {
  it("logs and throws without the contact's fields", async () => {
    // Validation is bypassed on purpose, so the phone only has to be a unique marker
    const secretPhone = `+7 999 ${marker}`;
    const secretEmail = `leak-${marker}@example.com`;
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // A null name violates NOT NULL, and Postgres puts the whole failing row into the error
      const broken = { name: null, phone: secretPhone, email: secretEmail } as unknown as ContactInput;
      const error = await createContact(broken).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(Error);
      const thrown = error as Error;
      expect(thrown.message).toBe("Failed to create contact");
      expect(thrown.cause).toBeUndefined();

      const logged = JSON.stringify(errorLog.mock.calls);
      expect(logged).toContain("23502");
      expect(logged).not.toContain(secretPhone);
      expect(logged).not.toContain(secretEmail);
    } finally {
      errorLog.mockRestore();
    }
  });
});
