import { count, desc, eq, ilike, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { contacts, notes } from "@/db/schema";
import type { ContactInput } from "@/lib/validation";

// Data access for contacts. Imported only by server components, server actions and scripts.

export const PAGE_SIZE = 50;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function listContacts({ query, page }: { query?: string; page: number }) {
  const db = getDb();
  const term = query?.trim();
  const where = term ? ilike(contacts.name, `%${escapeLike(term)}%`) : undefined;

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

export async function getContactWithNotes(id: string) {
  if (!UUID_PATTERN.test(id)) {
    return null;
  }
  const db = getDb();
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
  if (!contact) {
    return null;
  }
  const contactNotes = await db
    .select()
    .from(notes)
    .where(eq(notes.contactId, id))
    .orderBy(desc(notes.createdAt), desc(notes.id));
  return { contact, notes: contactNotes };
}

export async function createContact(input: ContactInput) {
  const db = getDb();
  const [created] = await db.insert(contacts).values(input).returning({ id: contacts.id });
  return created.id;
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
  const [note] = await db.insert(notes).values({ contactId, body }).returning();
  return note;
}
