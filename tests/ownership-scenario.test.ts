import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db";
import { parseDate, toDateString } from "@/lib/keep-in-touch";
import { contactSchema } from "@/lib/validation";
import {
  addContactToGroup,
  addNote,
  createContact,
  deleteContact,
  getContact,
  getContactWithNotes,
  listBirthdays,
  listContacts,
  listReminders,
  removeContactFromGroup,
  setCadence,
  updateContact,
  updateNote,
} from "@/server/contacts";
import { createGroup, deleteGroup, findGroup, listGroups, renameGroup } from "@/server/groups";
import { type TestUser, createTestUser } from "./helpers/test-user";

// Scenarios of the data-ownership and contact-groups specs (change «login»): two users, A and B,
// against the real database from .env. Every test gets its own pair, so counts are exact and the
// data of one test cannot reach another. Users and everything they own are removed after each test.

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let a: TestUser;
let b: TestUser;

beforeEach(async () => {
  a = await createTestUser();
  b = await createTestUser();
});

afterEach(async () => {
  await a.remove();
  await b.remove();
});

afterAll(async () => {
  await pool.end();
  await closeDb();
});

function form(
  name: string,
  extra: { groupIds?: string[]; newGroup?: string; birthDay?: string; birthMonth?: string } = {},
) {
  return contactSchema.parse({ name, about: "", howWeMet: "", phone: "", email: "", ...extra });
}

async function contact(user: TestUser, name: string, extra?: Parameters<typeof form>[1]) {
  return createContact(user.id, form(name, extra));
}

async function group(user: TestUser, name: string) {
  const result = await createGroup(user.id, name);
  if (!("id" in result)) throw new Error(result.error);
  return result.id;
}

// Inserted directly: a past creation date makes the contact overdue without waiting
async function insertContact(
  user: TestUser,
  name: string,
  cadence: "week" | null,
  createdDaysAgo: number,
) {
  const { rows } = await pool.query<{ id: string }>(
    `insert into contacts (user_id, name, cadence, created_at)
     values ($1, $2, $3::contact_cadence, now() - $4 * interval '1 day') returning id`,
    [user.id, name, cadence, createdDaysAgo],
  );
  return rows[0].id;
}

// The contact row, its notes and its memberships exactly as stored
async function storedContact(id: string) {
  const { rows } = await pool.query(
    `select
       (select row_to_json(c) from contacts c where c.id = $1) as contact,
       coalesce((select json_agg(row_to_json(n) order by n.id) from notes n where n.contact_id = $1), '[]') as notes,
       coalesce((select json_agg(m.group_id order by m.group_id) from contact_groups m where m.contact_id = $1), '[]') as memberships`,
    [id],
  );
  return rows[0];
}

// The group row and the ids of its members exactly as stored
async function storedGroup(id: string) {
  const { rows } = await pool.query(
    `select
       (select row_to_json(g) from groups g where g.id = $1) as "group",
       coalesce((select json_agg(m.contact_id order by m.contact_id) from contact_groups m where m.group_id = $1), '[]') as members`,
    [id],
  );
  return rows[0];
}

describe("owner of a record", () => {
  it("makes the creator the owner of a new contact (scenario «Новый контакт»)", async () => {
    const id = await contact(a, "Новый контакт");

    const { rows } = await pool.query("select user_id from contacts where id = $1", [id]);
    expect(rows[0].user_id).toBe(a.id);
    expect((await listContacts(a.id, { page: 1 })).items.map((item) => item.id)).toEqual([id]);
  });

  it("makes the creator the owner of a group made in the contact form (scenario «Новая группа из формы контакта»)", async () => {
    const id = await contact(a, "С новой группой", { newGroup: "Соседи" });

    const { rows } = await pool.query<{ user_id: string }>(
      "select user_id from groups where id in (select group_id from contact_groups where contact_id = $1)",
      [id],
    );
    expect(rows.map((row) => row.user_id)).toEqual([a.id]);
    expect((await listGroups(a.id)).map((item) => item.name)).toEqual(["Соседи"]);
  });
});

describe("only own data on the screens", () => {
  it("does not show a contact of A in the list, the search or the total of B (scenario «Список и поиск»)", async () => {
    await contact(a, "Илья Морозов");
    await contact(b, "Анна Другая");

    const search = await listContacts(b.id, { query: "Морозов", page: 1 });
    expect(search.items).toEqual([]);
    expect(search.total).toBe(0);

    const list = await listContacts(b.id, { page: 1 });
    expect(list.items.map((item) => item.name)).toEqual(["Анна Другая"]);
    expect(list.total).toBe(1);

    // A finds their own contact
    expect((await listContacts(a.id, { query: "Морозов", page: 1 })).total).toBe(1);
  });

  it("does not show an overdue contact of A in the «Пора связаться» of B (scenario «Пора связаться»)", async () => {
    await insertContact(a, "Просрочен", "week", 30);
    await insertContact(b, "Без частоты", null, 5);

    expect(await listReminders(b.id)).toEqual({ items: [], withCadenceCount: 0, totalCount: 1 });
    expect((await listReminders(a.id)).items.map((item) => item.name)).toEqual(["Просрочен"]);
  });

  it("does not show a contact of A with a birthday tomorrow in the «Скоро день рождения» of B (scenario «Скоро день рождения»)", async () => {
    const { month, day } = parseDate(toDateString(new Date(Date.now() + 86_400_000)));
    const tomorrow = { birthDay: String(day), birthMonth: String(month) };
    await contact(a, "Именинник", tomorrow);
    await contact(b, "Свой", tomorrow);

    expect((await listBirthdays(b.id)).map((item) => item.name)).toEqual(["Свой"]);
    expect((await listBirthdays(a.id)).map((item) => item.name)).toEqual(["Именинник"]);
  });

  it("does not show a group of A to B: not in the groups, not in the filter, not in the form (scenario «Группы и фильтр»)", async () => {
    const neighbours = await group(a, "Соседи");
    await contact(a, "Сосед", { groupIds: [neighbours] });
    await contact(b, "Мой контакт");

    // The «Группы» page and the group choice in the contact form read the same list
    expect(await listGroups(b.id)).toEqual([]);
    expect(await findGroup(b.id, neighbours)).toBeNull();
    // The filter by a group of A is ignored for B: B's list, without the contacts of A
    const filtered = await listContacts(b.id, { page: 1, groupId: neighbours });
    expect(filtered.group).toBeNull();
    expect(filtered.items.map((item) => item.name)).toEqual(["Мой контакт"]);
    expect((await listReminders(b.id, { groupId: neighbours })).totalCount).toBe(1);

    expect((await listGroups(a.id)).map((item) => item.name)).toEqual(["Соседи"]);
  });
});

describe("a record of another user is as good as missing", () => {
  // Every request of B about a contact of A: the answers must be the same as for a contact that does not exist
  async function requestsOfB(contactId: string, noteId: string, groupId: string) {
    return {
      getContact: await getContact(b.id, contactId),
      getContactWithNotes: await getContactWithNotes(b.id, contactId),
      updateContact: await updateContact(b.id, contactId, form("Взломан")),
      setCadence: await setCadence(b.id, contactId, { cadence: "week", contactOn: null }),
      addNote: await addNote(b.id, contactId, "Чужая заметка"),
      updateNote: await updateNote(b.id, contactId, noteId, "Чужая правка"),
      addContactToGroup: await addContactToGroup(b.id, contactId, "Друзья"),
      removeContactFromGroup: await removeContactFromGroup(b.id, contactId, groupId),
      deleteContact: await deleteContact(b.id, contactId),
    };
  }

  it("does not read or change a contact of A for a request of B (scenario «Правка чужого контакта запросом»)", async () => {
    const friends = await group(a, "Друзья");
    const id = await contact(a, "Илья Морозов", { groupIds: [friends] });
    const note = await addNote(a.id, id, "Заметка A");
    const before = await storedContact(id);

    const answers = await requestsOfB(id, note!.id, friends);
    expect(answers).toEqual(await requestsOfB(randomUUID(), randomUUID(), randomUUID()));
    expect(answers).toEqual({
      getContact: null,
      getContactWithNotes: null,
      updateContact: null,
      setCadence: null,
      addNote: null,
      updateNote: null,
      addContactToGroup: null,
      removeContactFromGroup: false,
      deleteContact: null,
    });

    // The contact, its note and its group are as they were, and B got no group out of the attempt
    expect(await storedContact(id)).toEqual(before);
    expect(await listGroups(b.id)).toEqual([]);
  });

  it("does not rename or delete a group of A and does not put a contact of B into it (scenario «Чужая группа в запросе»)", async () => {
    const neighbours = await group(a, "Соседи");
    const neighbour = await contact(a, "Сосед", { groupIds: [neighbours] });
    const before = await storedGroup(neighbours);

    // B gets the same answers as for a group that does not exist
    expect(await renameGroup(b.id, neighbours, "Переименована")).toBeNull();
    expect(await renameGroup(b.id, randomUUID(), "Переименована")).toBeNull();
    expect(await deleteGroup(b.id, neighbours)).toBe(false);
    expect(await deleteGroup(b.id, randomUUID())).toBe(false);

    // B saves a new contact with the tick of the group of A
    const created = await contact(b, "Новый контакт B", { groupIds: [neighbours] });
    expect((await getContactWithNotes(b.id, created))!.groups).toEqual([]);

    expect(await storedGroup(neighbours)).toEqual(before);
    expect((await storedGroup(neighbours)).members).toEqual([neighbour]);
  });

  it("does not put a contact of B into a group of A by its id (scenario «Свой контакт в чужую группу»)", async () => {
    const neighbours = await group(a, "Соседи");
    const neighbour = await contact(a, "Сосед", { groupIds: [neighbours] });
    const mine = await contact(b, "Мой контакт");
    const before = await storedGroup(neighbours);

    // Saving an existing contact with the tick of the group of A
    expect(await updateContact(b.id, mine, form("Мой контакт", { groupIds: [neighbours] }))).toBe(
      mine,
    );
    expect((await storedContact(mine)).memberships).toEqual([]);
    expect(await removeContactFromGroup(b.id, mine, neighbours)).toBe(false);

    expect(await storedGroup(neighbours)).toEqual(before);
    expect((await storedGroup(neighbours)).members).toEqual([neighbour]);
  });
});

describe("a group of one's own", () => {
  it("lets A and B each have a group «Друзья» with their own contacts (scenario «Две группы „Друзья“»)", async () => {
    const aGroup = await group(a, "Друзья");
    const bGroup = await group(b, "Друзья");
    expect(bGroup).not.toBe(aGroup);
    await contact(a, "Друг A", { groupIds: [aGroup] });
    await contact(b, "Друг B", { groupIds: [bGroup] });

    expect(await listGroups(a.id)).toEqual([{ id: aGroup, name: "Друзья", contactCount: 1 }]);
    expect(await listGroups(b.id)).toEqual([{ id: bGroup, name: "Друзья", contactCount: 1 }]);
    const inGroupOfB = await listContacts(b.id, { page: 1, groupId: bGroup });
    expect(inGroupOfB.items.map((item) => item.name)).toEqual(["Друг B"]);
  });

  it("creates the group of B without an error when A has one with the same name (scenario «Такое имя у другого пользователя»)", async () => {
    const aGroup = await group(a, "Друзья");

    const result = await createGroup(b.id, "друзья");

    expect(result).toEqual({ id: expect.any(String) });
    expect((await listGroups(b.id)).map((item) => item.name)).toEqual(["друзья"]);
    expect(await listGroups(a.id)).toEqual([{ id: aGroup, name: "Друзья", contactCount: 0 }]);
  });

  it("gives B their own group when «Новая группа» in the form has the name of a group of A (scenario «„Новая группа“ с именем чужой группы»)", async () => {
    const aGroup = await group(a, "Соседи");
    const neighbour = await contact(a, "Сосед", { groupIds: [aGroup] });
    const before = await storedGroup(aGroup);

    const mine = await contact(b, "Мой контакт", { newGroup: "Соседи" });

    const bGroups = await listGroups(b.id);
    expect(bGroups).toEqual([{ id: expect.any(String), name: "Соседи", contactCount: 1 }]);
    expect(bGroups[0].id).not.toBe(aGroup);
    expect((await getContactWithNotes(b.id, mine))!.groups.map((item) => item.id)).toEqual([
      bGroups[0].id,
    ]);
    expect(await storedGroup(aGroup)).toEqual(before);
    expect((await storedGroup(aGroup)).members).toEqual([neighbour]);
  });
});
