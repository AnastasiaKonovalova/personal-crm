import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/db";
import { contactSchema } from "@/lib/validation";
import {
  PAGE_SIZE,
  addContactToGroup,
  createContact,
  deleteContact,
  getContactWithNotes,
  listContacts,
  listReminders,
  removeContactFromGroup,
  updateContact,
} from "@/server/contacts";
import { createGroup, listGroups } from "@/server/groups";

// Integration tests against the real database from .env. Every contact and group name carries
// a random marker, and only rows with that marker are removed afterwards.

const marker = randomUUID().slice(0, 8);

async function withSeparateConnection<T>(run: (pool: Pool) => Promise<T>) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

afterAll(async () => {
  await withSeparateConnection(async (pool) => {
    // Memberships go away via ON DELETE CASCADE from either side
    await pool.query("delete from contacts where name like $1", [`%${marker}%`]);
    await pool.query("delete from groups where name like $1", [`%${marker}%`]);
  });
  await closeDb();
});

async function group(name: string) {
  const result = await createGroup(`${name} ${marker}`);
  if (!("id" in result)) throw new Error(result.error);
  return result.id;
}

function form(fields: { name: string; groupIds?: string[]; newGroup?: string; about?: string }) {
  return contactSchema.parse({ about: "", howWeMet: "", phone: "", email: "", ...fields, name: `${fields.name} ${marker}` });
}

async function contact(name: string, groupIds: string[] = []) {
  return createContact(form({ name, groupIds }));
}

async function groupNamesOf(contactId: string) {
  return (await getContactWithNotes(contactId))!.groups.map((item) => item.name);
}

async function idsInGroup(groupId: string) {
  return (await listContacts({ page: 1, groupId })).items.map((item) => item.id);
}

// Inserted directly: past creation dates make contacts overdue without waiting
async function insertWithCadence(name: string, cadence: "week" | "month", createdDaysAgo: number) {
  const { rows } = await withSeparateConnection((pool) =>
    pool.query<{ id: string }>(
      `insert into contacts (name, cadence, created_at)
       values ($1, $2::contact_cadence, now() - $3 * interval '1 day') returning id`,
      [`${name} ${marker}`, cadence, createdDaysAgo],
    ),
  );
  return rows[0].id;
}

async function addMembers(groupId: string, contactIds: string[]) {
  await withSeparateConnection((pool) =>
    pool.query("insert into contact_groups (contact_id, group_id) select unnest($1::uuid[]), $2", [contactIds, groupId]),
  );
}

describe("groups in the contact form", () => {
  it("puts a contact in two groups at once (scenario «Две группы сразу»)", async () => {
    const friends = await group("Друзья");
    const tennis = await group("Теннис");
    const id = await contact("Две группы", [friends, tennis]);

    expect(await idsInGroup(friends)).toEqual([id]);
    expect(await idsInGroup(tennis)).toEqual([id]);
  });

  it("creates the new group and puts the contact in it (scenario «Новая группа в форме»)", async () => {
    const id = await contact("Новая группа");
    expect(await updateContact(id, form({ name: "Новая группа", newGroup: `Аналитики ${marker}` }))).toBe(id);

    const created = (await listGroups()).find((item) => item.name === `Аналитики ${marker}`);
    expect(created?.contactCount).toBe(1);
    expect(await groupNamesOf(id)).toEqual([`Аналитики ${marker}`]);
  });

  it("uses the existing group for its name in another case (scenario «В „Новая группа“ имя существующей»)", async () => {
    const neighbours = await group("Соседи");
    const id = await createContact(form({ name: "Сосед", newGroup: `соседи ${marker}` }));

    expect(await idsInGroup(neighbours)).toEqual([id]);
    const matching = (await listGroups()).filter((item) => item.name.toLowerCase() === `соседи ${marker}`);
    expect(matching).toHaveLength(1);
  });

  it("takes the contact out of an unticked group (scenario «Снять группу при правке»)", async () => {
    const friends = await group("Друзья-2");
    const tennis = await group("Теннис-2");
    const id = await contact("Снять группу", [friends, tennis]);

    await updateContact(id, form({ name: "Снять группу", groupIds: [friends] }));
    expect(await groupNamesOf(id)).toEqual([`Друзья-2 ${marker}`]);
  });

  it("drops ids of groups that do not exist", async () => {
    const family = await group("Семья");
    const id = await contact("Битые группы", [family, randomUUID()]);
    expect(await groupNamesOf(id)).toEqual([`Семья ${marker}`]);
  });

  it("does not touch groups when the contact is missing", async () => {
    const family = await group("Семья-2");
    expect(await updateContact(randomUUID(), form({ name: "Никто", groupIds: [family] }))).toBeNull();
    expect(await idsInGroup(family)).toEqual([]);
  });

  it("removes the memberships of a deleted contact", async () => {
    const family = await group("Семья-3");
    const id = await contact("Удаляемый", [family]);
    await deleteContact(id);
    expect((await listGroups()).find((item) => item.id === family)?.contactCount).toBe(0);
  });
});

describe("groups in the contact card", () => {
  it("lists the groups of the contact by name (scenario «Карточка с группами»)", async () => {
    const id = await contact("Карточка", [await group("Теннис-3"), await group("Друзья-3")]);
    expect(await groupNamesOf(id)).toEqual([`Друзья-3 ${marker}`, `Теннис-3 ${marker}`]);
  });

  it("adds the contact to an existing group and keeps its other fields (scenario «Добавить в группу из карточки»)", async () => {
    const family = await group("Семья-4");
    const id = await createContact(form({ name: "Добавить", about: "Дизайнер" }));
    const before = (await getContactWithNotes(id))!.contact;

    expect(await addContactToGroup(id, `Семья-4 ${marker}`)).toBe(family);
    const card = (await getContactWithNotes(id))!;
    expect(card.groups.map((item) => item.name)).toEqual([`Семья-4 ${marker}`]);
    expect(card.contact).toEqual(before);
  });

  it("removes the contact from one group, the group stays (scenario «Убрать из группы в карточке»)", async () => {
    const friends = await group("Друзья-4");
    const tennis = await group("Теннис-4");
    const id = await contact("Убрать", [friends, tennis]);

    expect(await removeContactFromGroup(id, tennis)).toBe(true);
    expect(await groupNamesOf(id)).toEqual([`Друзья-4 ${marker}`]);
    expect((await listGroups()).some((item) => item.id === tennis)).toBe(true);
  });

  it("creates a new group from the card with one contact (scenario «Новая группа из карточки»)", async () => {
    const id = await contact("Новая из карточки");
    const groupId = await addContactToGroup(id, `Соседи-2 ${marker}`);

    expect((await listGroups()).find((item) => item.id === groupId)).toMatchObject({
      name: `Соседи-2 ${marker}`,
      contactCount: 1,
    });
  });

  it("adds to the existing group for its name in another case (scenario «Имя существующей группы в карточке»)", async () => {
    const friends = await group("Друзья-5");
    const id = await contact("Существующая");

    expect(await addContactToGroup(id, `друзья-5 ${marker}`)).toBe(friends);
    expect((await listGroups()).filter((item) => item.name.toLowerCase() === `друзья-5 ${marker}`)).toHaveLength(1);
  });

  it("adding twice keeps one membership", async () => {
    const family = await group("Семья-5");
    const id = await contact("Дважды", [family]);
    expect(await addContactToGroup(id, `Семья-5 ${marker}`)).toBe(family);
    expect(await groupNamesOf(id)).toEqual([`Семья-5 ${marker}`]);
  });

  it("does nothing for a missing contact or group", async () => {
    const family = await group("Семья-6");
    expect(await addContactToGroup(randomUUID(), `Семья-6 ${marker}`)).toBeNull();
    expect(await addContactToGroup("not-a-uuid", `Семья-6 ${marker}`)).toBeNull();
    expect(await removeContactFromGroup(randomUUID(), family)).toBe(false);
    expect(await removeContactFromGroup("not-a-uuid", "not-a-uuid")).toBe(false);
  });
});

describe("groups in the contact list", () => {
  it("gives every row its groups by name", async () => {
    const id = await contact("Строка", [await group("Ж-группа"), await group("Ёж-группа"), await group("А-группа")]);
    const row = (await listContacts({ page: 1, query: `Строка ${marker}` })).items.find((item) => item.id === id);
    expect(row?.groups.map((item) => item.name)).toEqual([
      `А-группа ${marker}`,
      `Ёж-группа ${marker}`,
      `Ж-группа ${marker}`,
    ]);
  });

  it("filters by group together with the search (scenario «Фильтр и поиск вместе»)", async () => {
    const tennis = await group("Теннис-5");
    const anna = await contact("Анна Теннисная", [tennis]);
    await contact("Борис Теннисный", [tennis]);
    await contact("Анна Без группы");

    const result = await listContacts({ page: 1, query: "Анна", groupId: tennis });
    expect(result.items.map((item) => item.id)).toEqual([anna]);
    expect(result.total).toBe(1);
    expect(result.group).toEqual({ id: tennis, name: `Теннис-5 ${marker}` });
  });

  it("pages through a group (scenario «Страницы с фильтром»)", async () => {
    const big = await group("Большая");
    const { rows } = await withSeparateConnection((pool) =>
      pool.query<{ id: string }>(
        "insert into contacts (name) select 'Участник ' || lpad(n::text, 2, '0') || ' ' || $1 from generate_series(1, 60) n returning id",
        [marker],
      ),
    );
    await addMembers(big, rows.map((row) => row.id));

    const first = await listContacts({ page: 1, groupId: big });
    const second = await listContacts({ page: 2, groupId: big });
    expect(first.total).toBe(60);
    expect(first.pageCount).toBe(2);
    expect(first.items).toHaveLength(PAGE_SIZE);
    expect(second.items).toHaveLength(60 - PAGE_SIZE);
    const seen = new Set([...first.items, ...second.items].map((item) => item.id));
    expect([...seen].sort()).toEqual(rows.map((row) => row.id).sort());
  });

  it("shows nothing for an empty group (scenario «Пустая группа»)", async () => {
    const empty = await group("Пустая");
    const result = await listContacts({ page: 1, groupId: empty });
    expect(result).toMatchObject({ items: [], total: 0, group: { id: empty } });
    expect((await listReminders({ groupId: empty })).totalCount).toBe(0);
  });

  it("ignores a deleted or malformed group (scenario «Группа удалена, а ссылка с фильтром осталась»)", async () => {
    const all = await listContacts({ page: 1 });
    for (const groupId of [randomUUID(), "not-a-uuid"]) {
      const result = await listContacts({ page: 1, groupId });
      expect(result.group).toBeNull();
      expect(result.total).toBe(all.total);
    }
    expect((await listReminders({ groupId: randomUUID() })).totalCount).toBe((await listReminders()).totalCount);
  });
});

describe("«Пора связаться» in a group", () => {
  it("shows only the overdue contacts of the group (scenario «Блок в группе»)", async () => {
    const tennis = await group("Теннис-6");
    const first = await insertWithCadence("Просрочен 1", "week", 20);
    const second = await insertWithCadence("Просрочен 2", "week", 15);
    const outside = await insertWithCadence("Просрочен вне группы", "week", 30);
    await addMembers(tennis, [first, second]);

    const reminders = await listReminders({ groupId: tennis });
    expect(reminders.items.map((item) => item.id)).toEqual([first, second]);
    expect(reminders.items.some((item) => item.id === outside)).toBe(false);
    expect(reminders).toMatchObject({ withCadenceCount: 2, totalCount: 2 });
  });

  it("counts the empty state by the group (scenario «В группе все на связи»)", async () => {
    const calm = await group("Спокойная");
    const fine = await insertWithCadence("На связи", "month", 2);
    await insertWithCadence("Просрочен где-то ещё", "week", 30);
    await addMembers(calm, [fine]);

    const reminders = await listReminders({ groupId: calm });
    expect(reminders).toEqual({ items: [], withCadenceCount: 1, totalCount: 1 });
  });
});
