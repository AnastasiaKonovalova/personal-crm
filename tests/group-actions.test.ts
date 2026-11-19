import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type TestUser, createTestUser } from "./helpers/test-user";

// Server actions against the real database from .env. Only the Next.js request helpers are
// replaced: they need a running Next server. redirect() throws, as it does in Next.
// The test user owns all the data created here and is removed with it in afterAll.
// The session is replaced too: requireUser() returns the test user, or, with an empty userId, sends
// to /login as the real one does without a session.

const nextState = vi.hoisted(() => ({ calledFromJs: false }));
const session = vi.hoisted(() => ({ userId: "" }));

vi.mock("@/server/session", () => ({
  requireUser: async () => {
    if (!session.userId) {
      const { redirect } = await import("next/navigation");
      redirect("/login");
    }
    return { id: session.userId };
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(nextState.calledFromJs ? { "next-action": "test" } : {}),
}));

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}

const {
  createContactAction,
  updateContactAction,
  deleteContactAction,
  addNoteAction,
  updateNoteAction,
  setCadenceAction,
  markContactedAction,
  addContactToGroupAction,
  removeContactFromGroupAction,
} = await import("@/app/contacts/actions");
const { createGroupAction, renameGroupAction, deleteGroupAction } =
  await import("@/app/groups/actions");
const { closeDb } = await import("@/db");
const { createContact, getContactWithNotes } = await import("@/server/contacts");
const { createGroup, listGroups } = await import("@/server/groups");
const { contactSchema } = await import("@/lib/validation");

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

beforeAll(async () => {
  user = await createTestUser();
});

beforeEach(() => {
  nextState.calledFromJs = false;
  session.userId = user.id;
});

afterAll(async () => {
  await user.remove();
  await closeDb();
});

function formData(fields: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

const emptyContactFields = {
  name: "",
  about: "",
  howWeMet: "",
  phone: "",
  email: "",
  cadence: "",
  contactOn: "",
};

async function redirectOf(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    if (error instanceof RedirectSignal) return error.url;
    throw error;
  }
  return null;
}

async function group(name: string) {
  const result = await createGroup(user.id, `${name} ${marker}`);
  if (!("id" in result)) throw new Error(result.error);
  return result.id;
}

async function contact(name: string) {
  return createContact(
    user.id,
    contactSchema.parse({ ...emptyContactFields, name: `${name} ${marker}` }),
  );
}

const groupNamed = async (name: string) =>
  (await listGroups(user.id)).find((item) => item.name === name);
const groupNamesOf = async (contactId: string) =>
  (await getContactWithNotes(user.id, contactId))!.groups.map((item) => item.name);

describe("contact form with groups", () => {
  it("keeps the ticks and the new group text on an error and creates nothing (scenario «Ошибка формы не теряет группы»)", async () => {
    const family = await group("Семья");
    const state = await createContactAction(
      {},
      formData({ ...emptyContactFields, groupIds: [family], newGroup: `Аналитики ${marker}` }),
    );

    expect(state.errors).toEqual({ name: "Имя обязательно" });
    expect(state.values?.groupIds).toEqual([family]);
    expect(state.values?.newGroup).toBe(`Аналитики ${marker}`);
    expect(await groupNamed(`Аналитики ${marker}`)).toBeUndefined();
  });

  it("reports a too long new group name and saves no contact (scenario «Ошибка имени новой группы»)", async () => {
    const name = `Длинная группа ${marker}`;
    const state = await createContactAction(
      {},
      formData({ ...emptyContactFields, name, newGroup: "я".repeat(51) }),
    );

    expect(state.errors).toEqual({ newGroup: "Не длиннее 50 символов" });
    expect(state.values?.newGroup).toBe("я".repeat(51));
    const { rows } = await withSeparateConnection((pool) =>
      pool.query("select 1 from contacts where name = $1", [name]),
    );
    expect(rows).toHaveLength(0);
  });

  it("creates a contact with its groups and opens the card", async () => {
    const family = await group("Семья-2");
    const url = await redirectOf(() =>
      createContactAction(
        {},
        formData({
          ...emptyContactFields,
          name: `С группами ${marker}`,
          groupIds: [family],
          newGroup: `Новая ${marker}`,
        }),
      ),
    );

    const id = url?.match(/^\/contacts\/([0-9a-f-]{36})$/)?.[1];
    expect(id).toBeDefined();
    expect(await groupNamesOf(id!)).toEqual([`Новая ${marker}`, `Семья-2 ${marker}`]);
  });

  it("keeps the ticks on an error when editing", async () => {
    const id = await contact("Правка");
    const tennis = await group("Теннис");
    const state = await updateContactAction(
      {},
      formData({ ...emptyContactFields, contactId: id, groupIds: [tennis], newGroup: "  " }),
    );

    expect(state.errors).toEqual({ name: "Имя обязательно" });
    expect(state.values?.groupIds).toEqual([tennis]);
    expect(state.values?.newGroup).toBe("  ");
    expect(await groupNamesOf(id)).toEqual([]);
  });

  it("saves the groups when editing", async () => {
    const id = await contact("Правка-2");
    const tennis = await group("Теннис-2");
    const url = await redirectOf(() =>
      updateContactAction(
        {},
        formData({
          ...emptyContactFields,
          name: `Правка-2 ${marker}`,
          contactId: id,
          groupIds: [tennis],
        }),
      ),
    );

    expect(url).toBe(`/contacts/${id}`);
    expect(await groupNamesOf(id)).toEqual([`Теннис-2 ${marker}`]);
  });
});

describe("groups in the contact card", () => {
  it("rejects an empty group name and changes nothing", async () => {
    const id = await contact("Пустое имя");
    const state = await addContactToGroupAction({}, formData({ contactId: id, groupName: "   " }));
    expect(state).toEqual({ groupName: "   ", error: "Укажи название" });
    expect(await groupNamesOf(id)).toEqual([]);
  });

  it("adds to a group and returns to the card without JavaScript", async () => {
    const id = await contact("Добавить");
    const family = await group("Семья-3");
    const url = await redirectOf(() =>
      addContactToGroupAction({}, formData({ contactId: id, groupName: ` Семья-3 ${marker} ` })),
    );

    expect(url).toBe(`/contacts/${id}`);
    expect(await groupNamesOf(id)).toEqual([`Семья-3 ${marker}`]);
    expect((await groupNamed(`Семья-3 ${marker}`))?.id).toBe(family);
  });

  it("updates in place with JavaScript", async () => {
    nextState.calledFromJs = true;
    const id = await contact("С JS");
    const state = await addContactToGroupAction(
      {},
      formData({ contactId: id, groupName: `Соседи ${marker}` }),
    );

    expect(state.savedAt).toBeTypeOf("number");
    expect(await groupNamesOf(id)).toEqual([`Соседи ${marker}`]);
  });

  it("reports a missing contact and creates no group (scenario «Контакт удалили в другой вкладке»)", async () => {
    const state = await addContactToGroupAction(
      {},
      formData({ contactId: randomUUID(), groupName: `Никуда ${marker}` }),
    );
    expect(state).toEqual({ groupName: `Никуда ${marker}`, error: "Контакт не найден" });
    expect(await groupNamed(`Никуда ${marker}`)).toBeUndefined();
  });

  it("removes from a group and returns to the card without the dialog", async () => {
    const id = await contact("Убрать");
    const tennis = await group("Теннис-3");
    await addContactToGroupAction(
      {},
      formData({ contactId: id, groupName: `Теннис-3 ${marker}` }),
    ).catch(() => undefined);

    const url = await redirectOf(() =>
      removeContactFromGroupAction(formData({ contactId: id, groupId: tennis })),
    );
    expect(url).toBe(`/contacts/${id}`);
    expect(await groupNamesOf(id)).toEqual([]);
    expect(await groupNamed(`Теннис-3 ${marker}`)).toBeDefined();
  });
});

describe("the «Группы» page", () => {
  it("rejects an empty name (scenario «Пустое имя»)", async () => {
    expect(await createGroupAction({}, formData({ name: "   " }))).toEqual({
      name: "   ",
      error: "Укажи название",
    });
  });

  it("rejects a name that already exists (scenario «Такое имя уже есть»)", async () => {
    await group("Друзья");
    expect(await createGroupAction({}, formData({ name: `друзья ${marker}` }))).toEqual({
      name: `друзья ${marker}`,
      error: "Такая группа уже есть",
    });
  });

  it("creates a group: back to the page without JavaScript, in place with it", async () => {
    expect(await redirectOf(() => createGroupAction({}, formData({ name: `Бег ${marker}` })))).toBe(
      "/groups",
    );
    expect((await groupNamed(`Бег ${marker}`))?.contactCount).toBe(0);

    nextState.calledFromJs = true;
    const state = await createGroupAction({}, formData({ name: `  Йога ${marker}  ` }));
    expect(state.savedAt).toBeTypeOf("number");
    expect(await groupNamed(`Йога ${marker}`)).toBeDefined();
  });

  it("renames a group and leaves the edit mode", async () => {
    const id = await group("Теннис-4");
    const url = await redirectOf(() =>
      renameGroupAction({}, formData({ groupId: id, name: `Теннис по субботам ${marker}` })),
    );
    expect(url).toBe("/groups");
    expect((await groupNamed(`Теннис по субботам ${marker}`))?.id).toBe(id);
  });

  it("keeps the edit mode on a rename error", async () => {
    await group("Соседи-2");
    const id = await group("Коллеги");
    expect(
      await renameGroupAction({}, formData({ groupId: id, name: `соседи-2 ${marker}` })),
    ).toEqual({
      name: `соседи-2 ${marker}`,
      error: "Такая группа уже есть",
    });
    expect(await renameGroupAction({}, formData({ groupId: id, name: "я".repeat(51) }))).toEqual({
      name: "я".repeat(51),
      error: "Не длиннее 50 символов",
    });
    // Scenario «Группу удалили в другой вкладке»
    expect(
      await renameGroupAction({}, formData({ groupId: randomUUID(), name: `Нет ${marker}` })),
    ).toEqual({
      name: `Нет ${marker}`,
      error: "Группа не найдена",
    });
  });

  it("deletes a group and returns to the page without the dialog", async () => {
    const id = await group("Аналитики-2");
    expect(await redirectOf(() => deleteGroupAction(formData({ groupId: id })))).toBe("/groups");
    expect(await groupNamed(`Аналитики-2 ${marker}`)).toBeUndefined();
  });
});

describe("without a session", () => {
  it("sends every action to the sign-in page and changes nothing (scenario «Отправка формы без входа»)", async () => {
    const id = await contact("Без входа");
    const groupId = await group("Группа без входа");
    const state = async () => ({
      card: await getContactWithNotes(user.id, id),
      groups: await listGroups(user.id),
      contactCount: (
        await withSeparateConnection((pool) =>
          pool.query<{ n: number }>("select count(*)::int as n from contacts where user_id = $1", [
            user.id,
          ]),
        )
      ).rows[0].n,
    });
    const before = await state();

    session.userId = "";
    const ids = { contactId: id, groupId, noteId: randomUUID() };
    const attempts = [
      () =>
        createContactAction(
          {},
          formData({ ...emptyContactFields, name: `Новый без входа ${marker}` }),
        ),
      () =>
        updateContactAction(
          {},
          formData({ ...emptyContactFields, ...ids, name: `Правка без входа ${marker}` }),
        ),
      () => deleteContactAction(formData(ids)),
      () => addNoteAction({}, formData({ ...ids, body: "Заметка без входа" })),
      () => updateNoteAction({}, formData({ ...ids, body: "Правка без входа" })),
      () => setCadenceAction({}, formData({ ...ids, cadence: "week", contactOn: "" })),
      () => markContactedAction({}, formData({ ...ids, returnTo: "/" })),
      () =>
        addContactToGroupAction({}, formData({ ...ids, groupName: `Новая без входа ${marker}` })),
      () => removeContactFromGroupAction(formData(ids)),
      () => createGroupAction({}, formData({ name: `Группа без входа 2 ${marker}` })),
      () => renameGroupAction({}, formData({ ...ids, name: `Переименована без входа ${marker}` })),
      () => deleteGroupAction(formData(ids)),
    ];
    const urls: (string | null)[] = [];
    for (const attempt of attempts) urls.push(await redirectOf(attempt));

    expect(urls).toEqual(attempts.map(() => "/login"));
    session.userId = user.id;
    expect(await state()).toEqual(before);
  });
});
