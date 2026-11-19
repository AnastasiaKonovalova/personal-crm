import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@/db";
import {
  DUPLICATE_GROUP_ERROR,
  createGroup,
  deleteGroup,
  findGroup,
  findOrCreateGroup,
  listGroups,
  renameGroup,
} from "@/server/groups";
import { type TestUser, createTestUser } from "./helpers/test-user";

// Integration tests against the real database from .env. Every name carries a marker. The test user
// owns all the data created here and is removed with it in afterAll.

const marker = randomUUID().slice(0, 8);
let user: TestUser;

async function withSeparateConnection<T>(run: (pool: Pool) => Promise<T>) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

async function created(name: string) {
  const result = await createGroup(user.id, name);
  if (!("id" in result)) throw new Error(`Group «${name}» was not created: ${result.error}`);
  return result.id;
}

async function insertContact(name: string) {
  return withSeparateConnection(async (pool) => {
    const { rows } = await pool.query<{ id: string }>(
      "insert into contacts (user_id, name) values ($1, $2) returning id",
      [user.id, `${name} ${marker}`],
    );
    await pool.query("insert into notes (contact_id, body) values ($1, $2)", [
      rows[0].id,
      `Заметка ${marker}`,
    ]);
    return rows[0].id;
  });
}

async function addMember(contactId: string, groupId: string) {
  await withSeparateConnection((pool) =>
    pool.query("insert into contact_groups (contact_id, group_id) values ($1, $2)", [
      contactId,
      groupId,
    ]),
  );
}

async function groupOf(id: string) {
  return (await listGroups(user.id)).find((group) => group.id === id);
}

beforeAll(async () => {
  user = await createTestUser();
});

afterAll(async () => {
  // Memberships go away via ON DELETE CASCADE
  await user.remove();
  await closeDb();
});

describe("creating groups", () => {
  it("creates a group with zero contacts (scenario «Создание на странице „Группы“»)", async () => {
    const id = await created(`Теннис ${marker}`);
    expect(await groupOf(id)).toEqual({ id, name: `Теннис ${marker}`, contactCount: 0 });
  });

  it("rejects the same name in another case (scenario «Такое имя уже есть»)", async () => {
    await created(`Друзья ${marker}`);
    expect(await createGroup(user.id, `друзья ${marker}`)).toEqual({
      error: DUPLICATE_GROUP_ERROR,
    });
    const matching = (await listGroups(user.id)).filter(
      (group) => group.name.toLowerCase() === `друзья ${marker}`,
    );
    expect(matching).toHaveLength(1);
  });

  it("does not tell «ё» from «е» (scenario «„Ё“ и „е“ не различаются»)", async () => {
    await created(`Ёлка ${marker}`);
    expect(await createGroup(user.id, `Елка ${marker}`)).toEqual({ error: DUPLICATE_GROUP_ERROR });
    expect(DUPLICATE_GROUP_ERROR).toBe("Такая группа уже есть");
  });
});

describe("listing groups", () => {
  it("sorts groups by name, «ё» as «е» and ignoring case", async () => {
    const names = [
      `я-${marker} теннис`,
      `я-${marker} Семья`,
      `я-${marker} ёж`,
      `я-${marker} Есенин`,
    ];
    for (const name of names) await created(name);
    const ours = (await listGroups(user.id))
      .filter((group) => group.name.startsWith(`я-${marker}`))
      .map((g) => g.name);
    // "ёж" is sorted as "еж": "ж" comes before "с"
    expect(ours).toEqual([
      `я-${marker} ёж`,
      `я-${marker} Есенин`,
      `я-${marker} Семья`,
      `я-${marker} теннис`,
    ]);
  });

  it("counts contacts of a group (scenario «Число контактов меняется»)", async () => {
    const groupId = await created(`Семья ${marker}`);
    const contactId = await insertContact("Член семьи");
    const before = (await groupOf(groupId))!.contactCount;
    await addMember(contactId, groupId);
    expect((await groupOf(groupId))!.contactCount).toBe(before + 1);
  });
});

describe("renaming groups", () => {
  it("renames a group and keeps its members (scenario «Новое имя»)", async () => {
    const groupId = await created(`Теннис-2 ${marker}`);
    const contactId = await insertContact("Теннисист");
    await addMember(contactId, groupId);

    expect(await renameGroup(user.id, groupId, `Теннис по субботам ${marker}`)).toEqual({
      id: groupId,
    });
    expect(await groupOf(groupId)).toEqual({
      id: groupId,
      name: `Теннис по субботам ${marker}`,
      contactCount: 1,
    });
  });

  it("allows changing only the case (scenario «Смена регистра»)", async () => {
    const groupId = await created(`теннис-3 ${marker}`);
    expect(await renameGroup(user.id, groupId, `Теннис-3 ${marker}`)).toEqual({ id: groupId });
    expect((await groupOf(groupId))!.name).toBe(`Теннис-3 ${marker}`);
  });

  it("rejects the name of another group", async () => {
    await created(`Соседи ${marker}`);
    const groupId = await created(`Коллеги ${marker}`);
    expect(await renameGroup(user.id, groupId, `СОСЕДИ ${marker}`)).toEqual({
      error: DUPLICATE_GROUP_ERROR,
    });
    expect((await groupOf(groupId))!.name).toBe(`Коллеги ${marker}`);
  });

  it("returns null for a missing or malformed id", async () => {
    expect(await renameGroup(user.id, randomUUID(), `Никакая ${marker}`)).toBeNull();
    expect(await renameGroup(user.id, "not-a-uuid", `Никакая ${marker}`)).toBeNull();
  });
});

describe("deleting groups", () => {
  it("keeps the contacts, their notes and other groups (scenario «Удаление группы с контактами»)", async () => {
    const analysts = await created(`Аналитики ${marker}`);
    const other = await created(`Бег ${marker}`);
    const members = [
      await insertContact("Аналитик 1"),
      await insertContact("Аналитик 2"),
      await insertContact("Аналитик 3"),
    ];
    for (const contactId of members) await addMember(contactId, analysts);
    await addMember(members[0], other);

    expect(await deleteGroup(user.id, analysts)).toBe(true);

    expect(await groupOf(analysts)).toBeUndefined();
    const { rows } = await withSeparateConnection((pool) =>
      pool.query<{ contacts: number; notes: number; memberships: number }>(
        `select
           (select count(*)::int from contacts where id = any($1)) as contacts,
           (select count(*)::int from notes where contact_id = any($1)) as notes,
           (select count(*)::int from contact_groups where contact_id = any($1)) as memberships`,
        [members],
      ),
    );
    expect(rows[0]).toEqual({ contacts: 3, notes: 3, memberships: 1 });
    expect((await groupOf(other))!.contactCount).toBe(1);
  });

  it("returns false for a missing or malformed id", async () => {
    expect(await deleteGroup(user.id, randomUUID())).toBe(false);
    expect(await deleteGroup(user.id, "not-a-uuid")).toBe(false);
  });
});

describe("findOrCreateGroup", () => {
  it("creates a new group", async () => {
    const id = await findOrCreateGroup(user.id, `Аналитики-2 ${marker}`);
    expect((await groupOf(id))!.name).toBe(`Аналитики-2 ${marker}`);
  });

  it("returns the existing group for the same name in another case and with «ё»", async () => {
    const id = await created(`Ёжики ${marker}`);
    expect(await findOrCreateGroup(user.id, `ежики ${marker}`)).toBe(id);
    expect((await listGroups(user.id)).filter((group) => group.id === id)).toHaveLength(1);
  });
});

// The new contact form ticks the group from ?group=, the group page shows its name or a 404
describe("findGroup", () => {
  it("finds an existing group with its name", async () => {
    const id = await created(`Найденная ${marker}`);
    expect(await findGroup(user.id, id)).toEqual({ id, name: `Найденная ${marker}` });
  });

  it("returns null for a deleted group (scenario «Группа не найдена»)", async () => {
    const id = await created(`Временная ${marker}`);
    await deleteGroup(user.id, id);
    expect(await findGroup(user.id, id)).toBeNull();
  });

  it("returns null for a malformed or missing id", async () => {
    expect(await findGroup(user.id, "not-a-uuid")).toBeNull();
    expect(await findGroup(user.id, "")).toBeNull();
    expect(await findGroup(user.id, undefined)).toBeNull();
  });
});
