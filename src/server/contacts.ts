import { and, count, desc, eq, ilike, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { contacts, notes } from "@/db/schema";
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

export async function listContacts({ query, page }: { query?: string; page: number }) {
  const db = getDb();
  const term = query?.trim();
  const where = term
    ? ilike(sql`translate(${contacts.name}, 'Ёё', 'Ее')`, `%${escapeLike(foldYo(term))}%`)
    : undefined;

  const [{ total }] = await db.select({ total: count() }).from(contacts).where(where);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount);

  const items = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      about: contacts.about,
      howWeMet: contacts.howWeMet,
    })
    .from(contacts)
    .where(where)
    .orderBy(sql`lower(${contacts.name})`, contacts.id)
    .limit(PAGE_SIZE)
    .offset((currentPage - 1) * PAGE_SIZE);

  return { items, total, page: currentPage, pageCount };
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
  return { contact, notes: contactNotes };
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
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.id, contactId));
  if (!contact) {
    return null;
  }
  const [note] = await safeWrite("add note", () =>
    db.insert(notes).values({ contactId, body }).returning(),
  );
  return note;
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
