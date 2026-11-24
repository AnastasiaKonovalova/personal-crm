import { type SQL, and, count, desc, eq, ilike, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { contactGroups, contacts, notes } from "@/db/schema";
import { type Birthday, nextBirthday, sortForBirthdays } from "@/lib/birthdays";
import {
  type Cadence,
  dueDate,
  sortForReminders,
  status as statusOn,
  toDateString,
} from "@/lib/keep-in-touch";
import { type ContactInput, foldYo } from "@/lib/validation";
import { UUID_PATTERN, safeWrite } from "@/server/db-errors";
import { type Executor, existingGroupIds, findGroup, findOrCreateGroupIn } from "@/server/groups";

// Data access for contacts. Imported only by server components, server actions and scripts.
// Every function takes the owner's id first and only sees that user's contacts: a contact of another
// user does not exist for it (null or false, like a deleted one). Notes and group memberships belong
// to the owner of their contact, so they are always reached through a contact of this user.

export const PAGE_SIZE = 50;

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// Last contact is the latest note, or the contact's creation if it has none. Raw names on purpose:
// a column interpolated into a single-table query may be rendered without its table, and then
// "contact_id = id" would silently compare notes.id
const lastContactAtSql = sql<Date>`coalesce(
  (select max(n.created_at) from notes n where n.contact_id = contacts.id),
  contacts.created_at
)`.mapWith(contacts.createdAt);

export type GroupChip = { id: string; name: string };

// Groups of the contact by name ("ё" as "е", case ignored). Raw names, as in lastContactAtSql
const groupsOfContactSql = sql<GroupChip[]>`coalesce(
  (select json_agg(json_build_object('id', g.id, 'name', g.name)
                   order by lower(translate(g.name, 'Ёё', 'Ее')), g.id)
   from contact_groups cg join groups g on g.id = cg.group_id
   where cg.contact_id = contacts.id),
  '[]'::json
)`;

function inGroupSql(groupId: string) {
  return sql`exists (select 1 from contact_groups cg where cg.contact_id = contacts.id and cg.group_id = ${groupId})`;
}

// The ids of the one contact of this user with this id: empty when the contact is someone else's or gone
function contactOf(userId: string, contactId: string) {
  return getDb()
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)));
}

type KeepInTouchRow = { cadence: Cadence | null; contactOn: string | null; lastContactAt: Date };

function keepInTouchOf({ cadence, contactOn, lastContactAt }: KeepInTouchRow, today: string) {
  const dueOn = dueDate(cadence, lastContactAt, contactOn);
  if (!cadence || !dueOn) {
    return { dueOn: null, status: null };
  }
  return { dueOn, status: statusOn(dueOn, today, cadence) };
}

// A malformed id, a deleted group or another user's group is ignored: the list is shown without the filter
export async function listContacts(
  userId: string,
  {
    query,
    page,
    groupId,
  }: {
    query?: string;
    page: number;
    groupId?: string;
  },
) {
  const db = getDb();
  const term = query?.trim();
  const group = await findGroup(userId, groupId);
  const where = and(
    eq(contacts.userId, userId),
    term
      ? ilike(sql`translate(${contacts.name}, 'Ёё', 'Ее')`, `%${escapeLike(foldYo(term))}%`)
      : undefined,
    group ? inGroupSql(group.id) : undefined,
  );

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
      groups: groupsOfContactSql,
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

  return { items, total, page: currentPage, pageCount, group };
}

// The "Пора связаться" block: every overdue or soon contact in display order, plus the counts the
// empty states need. Contacts with a cadence are few, so statuses are computed here, not in SQL.
// With a group, both the block and its empty-state counts cover only that group
export async function listReminders(userId: string, { groupId }: { groupId?: string } = {}) {
  const db = getDb();
  const group = await findGroup(userId, groupId);
  const mine = eq(contacts.userId, userId);
  const inGroup: SQL | undefined = group ? inGroupSql(group.id) : undefined;
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      cadence: contacts.cadence,
      contactOn: contacts.contactOn,
      lastContactAt: lastContactAtSql,
    })
    .from(contacts)
    .where(and(mine, isNotNull(contacts.cadence), inGroup));
  const [{ total }] = await db.select({ total: count() }).from(contacts).where(and(mine, inGroup));

  const today = toDateString(new Date());
  const withStatus = rows.flatMap(({ contactOn, lastContactAt, ...row }) => {
    const { dueOn, status } = keepInTouchOf(
      { cadence: row.cadence, contactOn, lastContactAt },
      today,
    );
    return dueOn && status && row.cadence ? [{ ...row, cadence: row.cadence, dueOn, status }] : [];
  });

  return { items: sortForReminders(withStatus), withCadenceCount: rows.length, totalCount: total };
}

// The "Скоро день рождения" block: contacts whose birthday was yesterday, is today or within SOON_DAYS,
// in display order. Birthdays are a few hundred at most, so the window (across the New Year and
// 29 February) is computed here, not in SQL. A malformed or missing group is ignored, like in the list
export async function listBirthdays(userId: string, { groupId }: { groupId?: string } = {}) {
  const group = await findGroup(userId, groupId);
  const rows = await getDb()
    .select({
      id: contacts.id,
      name: contacts.name,
      day: contacts.birthDay,
      month: contacts.birthMonth,
      year: contacts.birthYear,
      leapDay: contacts.birthLeapDay,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.userId, userId),
        isNotNull(contacts.birthMonth),
        group ? inGroupSql(group.id) : undefined,
      ),
    );

  const today = toDateString(new Date());
  return sortForBirthdays(
    rows.flatMap(({ id, name, day, month, year, leapDay }) => {
      // The CHECK keeps day and month together; this only narrows the types
      if (day === null || month === null) return [];
      const birthday: Birthday = { day, month, year, leapDay };
      return [{ id, name, days: nextBirthday(month, day, leapDay, today).days, birthday }];
    }),
  );
}

export async function getContact(userId: string, id: string) {
  if (!UUID_PATTERN.test(id)) {
    return null;
  }
  const db = getDb();
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.userId, userId)));
  return contact ?? null;
}

export async function getContactWithNotes(userId: string, id: string) {
  const contact = await getContact(userId, id);
  if (!contact) {
    return null;
  }
  const db = getDb();
  const contactNotes = await db
    .select()
    .from(notes)
    .where(eq(notes.contactId, id))
    .orderBy(desc(notes.createdAt), desc(notes.id));
  const [{ groups: contactGroupChips }] = await db
    .select({ groups: groupsOfContactSql })
    .from(contacts)
    .where(eq(contacts.id, id));

  // Notes come newest first, so the first one is the last contact
  const lastContactAt = contactNotes[0]?.createdAt ?? contact.createdAt;
  const keepInTouch = keepInTouchOf(
    { cadence: contact.cadence, contactOn: contact.contactOn, lastContactAt },
    toDateString(new Date()),
  );
  return { contact, notes: contactNotes, keepInTouch, groups: contactGroupChips };
}

// Replaces the contact's groups with the ticked ones plus the new group (found or created).
// Only the user's own groups count: ticks of other users' groups are dropped
async function saveContactGroups(
  userId: string,
  tx: Executor,
  contactId: string,
  groupIds: string[],
  newGroup: string | null,
) {
  const ids = await existingGroupIds(userId, tx, groupIds);
  if (newGroup) {
    ids.push(await findOrCreateGroupIn(userId, tx, newGroup));
  }
  await tx.delete(contactGroups).where(eq(contactGroups.contactId, contactId));
  if (ids.length > 0) {
    await tx
      .insert(contactGroups)
      .values(ids.map((groupId) => ({ contactId, groupId })))
      .onConflictDoNothing();
  }
}

// One transaction: the contact, the new group and the memberships are saved together or not at all
export async function createContact(
  userId: string,
  { groupIds, newGroup, ...fields }: ContactInput,
) {
  const db = getDb();
  return safeWrite("create contact", () =>
    db.transaction(async (tx) => {
      const [created] = await tx
        .insert(contacts)
        .values({ ...fields, userId })
        .returning({ id: contacts.id });
      await saveContactGroups(userId, tx, created.id, groupIds, newGroup);
      return created.id;
    }),
  );
}

export async function updateContact(
  userId: string,
  id: string,
  { groupIds, newGroup, ...fields }: ContactInput,
) {
  if (!UUID_PATTERN.test(id)) {
    return null;
  }
  const db = getDb();
  return safeWrite("update contact", () =>
    db.transaction(async (tx) => {
      const [updated] = await tx
        .update(contacts)
        .set(fields)
        .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
        .returning({ id: contacts.id });
      if (!updated) {
        return null;
      }
      await saveContactGroups(userId, tx, id, groupIds, newGroup);
      return updated.id;
    }),
  );
}

// The card field "Группа: выбрать или новая": an existing name adds to that group, a new name
// creates it. Only the membership changes. Returns the group id, or null for a missing contact.
// `name` comes in validated with groupNameSchema.
export async function addContactToGroup(userId: string, contactId: string, name: string) {
  if (!UUID_PATTERN.test(contactId)) {
    return null;
  }
  const db = getDb();
  return safeWrite("add contact to group", () =>
    db.transaction(async (tx) => {
      const [contact] = await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)));
      if (!contact) {
        return null;
      }
      const groupId = await findOrCreateGroupIn(userId, tx, name);
      await tx.insert(contactGroups).values({ contactId, groupId }).onConflictDoNothing();
      return groupId;
    }),
  );
}

// The group itself stays; true when the contact was in it. The contact must be the user's own: a
// membership is reached only through a contact of this user
export async function removeContactFromGroup(userId: string, contactId: string, groupId: string) {
  if (!UUID_PATTERN.test(contactId) || !UUID_PATTERN.test(groupId)) {
    return false;
  }
  const db = getDb();
  const removed = await safeWrite("remove contact from group", () =>
    db
      .delete(contactGroups)
      .where(
        and(
          eq(contactGroups.contactId, contactId),
          eq(contactGroups.groupId, groupId),
          inArray(contactGroups.contactId, contactOf(userId, contactId)),
        ),
      )
      .returning({ contactId: contactGroups.contactId }),
  );
  return removed.length > 0;
}

// Changes only the frequency (the form in the contact card); the input is validated with the saved date
export async function setCadence(
  userId: string,
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
      .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
      .returning({ id: contacts.id }),
  );
  return updated?.id ?? null;
}

// Notes go with the contact: notes.contact_id is ON DELETE CASCADE
export async function deleteContact(userId: string, id: string) {
  if (!UUID_PATTERN.test(id)) {
    return null;
  }
  const db = getDb();
  const [deleted] = await safeWrite("delete contact", () =>
    db
      .delete(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
      .returning({ id: contacts.id }),
  );
  return deleted?.id ?? null;
}

export async function addNote(userId: string, contactId: string, body: string) {
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
        .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)));
      if (!contact) {
        return null;
      }

      const [note] = await tx.insert(notes).values({ contactId, body }).returning();

      // A date is settled by a note made when it is overdue or soon; a note long before it leaves it
      if (contact.cadence === "date" && contact.contactOn) {
        const { kind } = statusOn(contact.contactOn, toDateString(note.createdAt), "date");
        if (kind !== "ok") {
          await tx
            .update(contacts)
            .set({ cadence: null, contactOn: null })
            .where(eq(contacts.id, contactId));
        }
      }
      return note;
    }),
  );
}

// The note must belong to this contact, and the contact to this user
export async function updateNote(userId: string, contactId: string, noteId: string, body: string) {
  if (!UUID_PATTERN.test(contactId) || !UUID_PATTERN.test(noteId)) {
    return null;
  }
  const db = getDb();
  const [note] = await safeWrite("update note", () =>
    db
      .update(notes)
      .set({ body })
      .where(
        and(
          eq(notes.id, noteId),
          eq(notes.contactId, contactId),
          inArray(notes.contactId, contactOf(userId, contactId)),
        ),
      )
      .returning(),
  );
  return note ?? null;
}
