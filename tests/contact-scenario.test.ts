import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db";
import { toDateString } from "@/lib/keep-in-touch";
import { cadenceSchemaFor, contactSchema, contactSchemaFor, type ContactInput } from "@/lib/validation";
import {
  PAGE_SIZE,
  addNote,
  createContact,
  deleteContact,
  getContact,
  getContactWithNotes,
  listContacts,
  listReminders,
  setCadence,
  updateContact,
  updateNote,
} from "@/server/contacts";

// Integration tests against the real database from .env (the success criteria from the spec)

const marker = randomUUID().slice(0, 8);
const testName = `Тестовый Контакт ${marker}`;
const noteText = `Созвонились, договорились о встрече ${marker}`;
let createdId: string | undefined;
const keepInTouchIds: string[] = [];

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
  if (keepInTouchIds.length > 0) {
    await withSeparateConnection((pool) =>
      pool.query("delete from contacts where id = any($1)", [keepInTouchIds]),
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

describe("deleting", () => {
  async function countNotes(contactId: string) {
    const { rows } = await withSeparateConnection((pool) =>
      pool.query<{ total: number }>("select count(*)::int as total from notes where contact_id = $1", [
        contactId,
      ]),
    );
    return rows[0].total;
  }

  it("deletes the contact together with its notes", async () => {
    expect(createdId).toBeDefined();
    expect(await countNotes(createdId!)).toBe(1);

    expect(await deleteContact(createdId!)).toBe(createdId);
    expect(await getContactWithNotes(createdId!)).toBeNull();
    expect(await countNotes(createdId!)).toBe(0);
    const found = await listContacts({ query: marker, page: 1 });
    expect(found.items).toEqual([]);
  });

  it("does not delete a missing contact", async () => {
    expect(createdId).toBeDefined();
    // Already deleted above, as if from another browser
    expect(await deleteContact(createdId!)).toBeNull();
    expect(await deleteContact(randomUUID())).toBeNull();
    expect(await deleteContact("not-a-uuid")).toBeNull();
  });
});

describe("keep in touch", () => {
  // Inserted directly: the test sets creation dates in the past and saved dates that validation
  // would refuse, to get overdue contacts without waiting
  async function insertContact(fields: {
    name: string;
    cadence: string | null;
    contactOn?: string | null;
    createdDaysAgo: number;
  }) {
    const { rows } = await withSeparateConnection((pool) =>
      pool.query<{ id: string }>(
        `insert into contacts (name, cadence, contact_on, created_at)
         values ($1, $2::contact_cadence, $3, now() - $4 * interval '1 day') returning id`,
        [`${fields.name} ${marker}`, fields.cadence, fields.contactOn ?? null, fields.createdDaysAgo],
      ),
    );
    keepInTouchIds.push(rows[0].id);
    return rows[0].id;
  }

  async function insertNote(contactId: string, daysAgo: number) {
    await withSeparateConnection((pool) =>
      pool.query(
        "insert into notes (contact_id, body, created_at) values ($1, 'Старая заметка', now() - $2 * interval '1 day')",
        [contactId, daysAgo],
      ),
    );
  }

  const dayFromToday = (offset: number) => toDateString(new Date(Date.now() + offset * 24 * 60 * 60 * 1000));

  it("orders the block: longer overdue first, then soon, contacts that are fine and without cadence left out", async () => {
    const weekly = await insertContact({ name: "Недельный", cadence: "week", createdDaysAgo: 20 });
    const monthly = await insertContact({ name: "Месячный", cadence: "month", createdDaysAgo: 40 });
    const soon = await insertContact({ name: "Скоро", cadence: "week", createdDaysAgo: 6 });
    const fine = await insertContact({ name: "В порядке", cadence: "month", createdDaysAgo: 5 });
    const without = await insertContact({ name: "Без частоты", cadence: null, createdDaysAgo: 100 });

    const reminders = await listReminders();
    const ours = reminders.items.filter((item) => item.name.endsWith(marker));
    // Weekly: 13 days overdue; monthly: 9-12 days overdue, whatever the month lengths
    expect(ours.map((item) => item.id)).toEqual([weekly, monthly, soon]);
    expect(ours[0].status).toEqual({ kind: "overdue", days: 13 });
    expect(ours[2].status).toEqual({ kind: "soon", days: 1 });
    expect([fine, without].some((id) => reminders.items.some((item) => item.id === id))).toBe(false);

    expect(reminders.withCadenceCount).toBeGreaterThanOrEqual(4);
    expect(reminders.totalCount).toBeGreaterThanOrEqual(5);
  });

  it("counts a contact without notes from its creation and a contact with notes from the latest note", async () => {
    const id = await insertContact({ name: "Без заметок", cadence: "month", createdDaysAgo: 100 });
    expect((await getContactWithNotes(id))?.keepInTouch.status?.kind).toBe("overdue");

    await insertNote(id, 3);
    const card = await getContactWithNotes(id);
    expect(card?.keepInTouch.status?.kind).toBe("ok");
    expect(card?.keepInTouch.dueOn).toBeDefined();
    expect((await listReminders()).items.some((item) => item.id === id)).toBe(false);
  });

  it("keeps the cadence after a new note and starts the term again", async () => {
    const id = await insertContact({ name: "Период сохраняется", cadence: "month", createdDaysAgo: 100 });
    await addNote(id, "Созвонились");

    expect((await getContact(id))?.cadence).toBe("month");
    expect((await getContactWithNotes(id))?.keepInTouch.status?.kind).toBe("ok");
  });

  it("does not move the term when an old note is edited", async () => {
    const id = await insertContact({ name: "Правка заметки", cadence: "week", createdDaysAgo: 30 });
    await insertNote(id, 10);
    const before = await getContactWithNotes(id);
    expect(before?.keepInTouch.status).toEqual({ kind: "overdue", days: 3 });

    expect(await updateNote(id, before!.notes[0].id, "Исправленный текст")).not.toBeNull();
    expect((await getContactWithNotes(id))?.keepInTouch).toEqual(before?.keepInTouch);
  });

  it("shows the status in the contact list", async () => {
    const id = await insertContact({ name: "Список", cadence: "week", createdDaysAgo: 20 });
    const found = await listContacts({ query: `Список ${marker}`, page: 1 });
    expect(found.items.map((item) => item.id)).toEqual([id]);
    expect(found.items[0].status).toEqual({ kind: "overdue", days: 13 });
    expect(found.items[0].dueOn).toBeTypeOf("string");
  });

  it("clears a specific date when the note is made soon before it", async () => {
    const id = await insertContact({ name: "Дата скоро", cadence: "date", contactOn: dayFromToday(1), createdDaysAgo: 5 });
    await addNote(id, "Связались");

    const contact = await getContact(id);
    expect(contact?.cadence).toBeNull();
    expect(contact?.contactOn).toBeNull();
    expect((await listReminders()).items.some((item) => item.id === id)).toBe(false);
  });

  it("clears a specific date that is already overdue", async () => {
    const id = await insertContact({ name: "Дата прошла", cadence: "date", contactOn: dayFromToday(-5), createdDaysAgo: 30 });
    await addNote(id, "Связались");

    const contact = await getContact(id);
    expect(contact?.cadence).toBeNull();
    expect(contact?.contactOn).toBeNull();
  });

  it("keeps a specific date when the note is made long before it", async () => {
    const date = dayFromToday(30);
    const id = await insertContact({ name: "Дата далеко", cadence: "date", contactOn: date, createdDaysAgo: 5 });
    await addNote(id, "Просто заметка");

    const contact = await getContact(id);
    expect(contact?.cadence).toBe("date");
    expect(contact?.contactOn).toBe(date);
  });

  // What updateContactAction does: validate against the saved date, then write
  it("saves a contact with a passed date after only its phone is edited", async () => {
    const date = dayFromToday(-5);
    const id = await insertContact({ name: "Правка телефона", cadence: "date", contactOn: date, createdDaysAgo: 30 });
    const saved = await getContact(id);
    const form = {
      name: saved!.name,
      about: "",
      howWeMet: "",
      phone: "+7 (222) 222-22-22",
      email: "",
      cadence: "date",
      contactOn: saved!.contactOn!,
    };

    // The same form is refused for a contact that has no such saved date
    expect(contactSchemaFor(null).safeParse(form).success).toBe(false);

    const parsed = contactSchemaFor(saved!.contactOn).safeParse(form);
    expect(parsed.success).toBe(true);
    expect(await updateContact(id, parsed.data!)).toBe(id);

    const card = await getContactWithNotes(id);
    expect(card?.contact.phone).toBe("+7 (222) 222-22-22");
    expect(card?.contact.contactOn).toBe(date);
    expect(card?.keepInTouch.status).toEqual({ kind: "overdue", days: 5 });
  });

  it("changes the frequency from the card and recounts the term from the last contact", async () => {
    const id = await insertContact({ name: "Смена частоты", cadence: "month", createdDaysAgo: 20 });
    expect((await getContactWithNotes(id))?.keepInTouch.status?.kind).toBe("ok");

    const parsed = cadenceSchemaFor(null).parse({ cadence: "week", contactOn: "" });
    expect(await setCadence(id, parsed)).toBe(id);

    const card = await getContactWithNotes(id);
    expect(card?.contact.cadence).toBe("week");
    expect(card?.keepInTouch.status).toEqual({ kind: "overdue", days: 13 });
  });

  it("switches from a specific date to a period and drops the date", async () => {
    const id = await insertContact({ name: "Дата на период", cadence: "date", contactOn: dayFromToday(10), createdDaysAgo: 5 });
    const saved = await getContact(id);

    const parsed = cadenceSchemaFor(saved!.contactOn).parse({ cadence: "month", contactOn: saved!.contactOn });
    await setCadence(id, parsed);

    const contact = await getContact(id);
    expect(contact?.cadence).toBe("month");
    expect(contact?.contactOn).toBeNull();
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
