import { and, count, desc, eq, ilike, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { contacts, notes } from "@/db/schema";
import {
  type Cadence,
  dueDate,
  sortForReminders,
  status as statusOn,
  toDateString,
} from "@/lib/keep-in-touch";
import type { ContactInput } from "@/lib/validation";

// Data access for contacts. Imported only by server components, server actions and scripts.

export const PAGE_SIZE = 50;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// "ё" and "е" are interchangeable in search: both the name and the query are folded to "е"
function foldYo(value: string) {
  return value.replace(/ё/g, "е").replace(/Ё/g, "Е");
}

function postgresCode(error: unknown): string | undefined {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ("code" in current && typeof current.code === "string") {
      return current.code;
    }
  }
  return undefined;
}

// Database errors carry the query parameters (contact fields, note text) in their message and
// detail. Log only the operation and the Postgres error code, and rethrow without the cause,
// so personal data never reaches the logs.
async function safeWrite<T>(operation: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`Database write failed: ${operation}`, { code: postgresCode(error) });
    throw new Error(`Failed to ${operation}`);
  }
}

// Last contact is the latest note, or the contact's creation if it has none. Raw names on purpose:
// a column interpolated into a single-table query may be rendered without its table, and then
// "contact_id = id" would silently compare notes.id
const lastContactAtSql = sql<Date>`coalesce(
  (select max(n.created_at) from notes n where n.contact_id = contacts.id),
  contacts.created_at
)`.mapWith(contacts.createdAt);

type KeepInTouchRow = { cadence: Cadence | null; contactOn: string | null; lastContactAt: Date };

function keepInTouchOf({ cadence, contactOn, lastContactAt }: KeepInTouchRow, today: string) {
  const dueOn = dueDate(cadence, lastContactAt, contactOn);
  if (!cadence || !dueOn) {
    return { dueOn: null, status: null };
  }
  return { dueOn, status: statusOn(dueOn, today, cadence) };
}

export async function listContacts({ query, page }: { query?: string; page: number }) {
  const db = getDb();
  const term = query?.trim();
  const where = term
    ? ilike(sql`translate(${contacts.name}, 'Ёё', 'Ее')`, `%${escapeLike(foldYo(term))}%`)
    : undefined;

  const [{ total }] = await db.select({ total: count() }).from(contacts).where(where);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount);

  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      about: contacts.about,
      howWeMet: contacts.howWeMet,
      cadence: contacts.cadence,
      contactOn: contacts.contactOn,
      lastContactAt: lastContactAtSql,
    })
    .from(contacts)
    .where(where)
    .orderBy(sql`lower(${contacts.name})`, contacts.id)
    .limit(PAGE_SIZE)
    .offset((currentPage - 1) * PAGE_SIZE);

  const today = toDateString(new Date());
  const items = rows.map(({ contactOn, lastContactAt, ...row }) => ({
    ...row,
    ...keepInTouchOf({ cadence: row.cadence, contactOn, lastContactAt }, today),
  }));

  return { items, total, page: currentPage, pageCount };
}

// The "Пора связаться" block: every overdue or soon contact in display order, plus the counts the
// empty states need. Contacts with a cadence are few, so statuses are computed here, not in SQL.
export async function listReminders() {
  const db = getDb();
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      cadence: contacts.cadence,
      contactOn: contacts.contactOn,
      lastContactAt: lastContactAtSql,
    })
    .from(contacts)
    .where(isNotNull(contacts.cadence));
  const [{ total }] = await db.select({ total: count() }).from(contacts);

  const today = toDateString(new Date());
  const withStatus = rows.flatMap(({ contactOn, lastContactAt, ...row }) => {
    const { dueOn, status } = keepInTouchOf({ cadence: row.cadence, contactOn, lastContactAt }, today);
    return dueOn && status && row.cadence ? [{ ...row, cadence: row.cadence, dueOn, status }] : [];
  });

  return { items: sortForReminders(withStatus), withCadenceCount: rows.length, totalCount: total };
}

export async function getContact(id: string) {
  if (!UUID_PATTERN.test(id)) {
    return null;
  }
  const db = getDb();
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
  return contact ?? null;
}

export async function getContactWithNotes(id: string) {
  const contact = await getContact(id);
  if (!contact) {
    return null;
  }
  const db = getDb();
  const contactNotes = await db
    .select()
    .from(notes)
    .where(eq(notes.contactId, id))
    .orderBy(desc(notes.createdAt), desc(notes.id));

  // Notes come newest first, so the first one is the last contact
  const lastContactAt = contactNotes[0]?.createdAt ?? contact.createdAt;
  const keepInTouch = keepInTouchOf(
    { cadence: contact.cadence, contactOn: contact.contactOn, lastContactAt },
    toDateString(new Date()),
  );
  return { contact, notes: contactNotes, keepInTouch };
}

export async function createContact(input: ContactInput) {
  const db = getDb();
  const [created] = await safeWrite("create contact", () =>
    db.insert(contacts).values(input).returning({ id: contacts.id }),
  );
  return created.id;
}

export async function updateContact(id: string, input: ContactInput) {
  if (!UUID_PATTERN.test(id)) {
    return null;
  }
  const db = getDb();
  const [updated] = await safeWrite("update contact", () =>
    db.update(contacts).set(input).where(eq(contacts.id, id)).returning({ id: contacts.id }),
  );
  return updated?.id ?? null;
}

// Changes only the frequency (the form in the contact card); the input is validated with the saved date
export async function setCadence(
  id: string,
  input: { cadence: Cadence | null; contactOn: string | null },
) {
  if (!UUID_PATTERN.test(id)) {
    return null;
  }
  const db = getDb();
  const [updated] = await safeWrite("set cadence", () =>
    db
      .update(contacts)
      .set({ cadence: input.cadence, contactOn: input.contactOn })
      .where(eq(contacts.id, id))
      .returning({ id: contacts.id }),
  );
  return updated?.id ?? null;
}

// Notes go with the contact: notes.contact_id is ON DELETE CASCADE
export async function deleteContact(id: string) {
  if (!UUID_PATTERN.test(id)) {
    return null;
  }
  const db = getDb();
  const [deleted] = await safeWrite("delete contact", () =>
    db.delete(contacts).where(eq(contacts.id, id)).returning({ id: contacts.id }),
  );
  return deleted?.id ?? null;
}

export async function addNote(contactId: string, body: string) {
  if (!UUID_PATTERN.test(contactId)) {
    return null;
  }
  const db = getDb();
  // One transaction: the note and, when it settles a specific date, the clearing of that date
  return safeWrite("add note", () =>
    db.transaction(async (tx) => {
      const [contact] = await tx
        .select({ cadence: contacts.cadence, contactOn: contacts.contactOn })
        .from(contacts)
        .where(eq(contacts.id, contactId));
      if (!contact) {
        return null;
      }

      const [note] = await tx.insert(notes).values({ contactId, body }).returning();

      // A date is settled by a note made when it is overdue or soon; a note long before it leaves it
      if (contact.cadence === "date" && contact.contactOn) {
        const { kind } = statusOn(contact.contactOn, toDateString(note.createdAt), "date");
        if (kind !== "ok") {
          await tx.update(contacts).set({ cadence: null, contactOn: null }).where(eq(contacts.id, contactId));
        }
      }
      return note;
    }),
  );
}

export async function updateNote(contactId: string, noteId: string, body: string) {
  if (!UUID_PATTERN.test(contactId) || !UUID_PATTERN.test(noteId)) {
    return null;
  }
  const db = getDb();
  const [note] = await safeWrite("update note", () =>
    db
      .update(notes)
      .set({ body })
      .where(and(eq(notes.id, noteId), eq(notes.contactId, contactId)))
      .returning(),
  );
  return note ?? null;
}
