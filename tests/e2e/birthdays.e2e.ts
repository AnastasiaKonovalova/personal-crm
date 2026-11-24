import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatDayMonth, parseDate, toDateString } from "../../src/lib/keep-in-touch";
import { signInClient, visibleText, withPool } from "./helpers";

// Birthdays over HTTP against a running app, signed in as a user of this test, forms sent the way
// a browser without JavaScript does it. Run: `pnpm build && pnpm start`, then `pnpm test:e2e`.

const marker = randomUUID().slice(0, 8);
let user: Awaited<ReturnType<typeof signInClient>>;

const emptyContact = {
  about: "",
  howWeMet: "",
  phone: "",
  email: "",
  cadence: "",
  contactOn: "",
  birthDay: "",
  birthMonth: "",
  birthYear: "",
};

// The markup of one form control: from its name to the end of the select, or the input tag itself
function control(html: string, name: string) {
  const after = html.split(`name="${name}"`)[1] ?? "";
  return after.includes("</select>") && after.indexOf("</select>") < after.indexOf("<select")
    ? after.split("</select>")[0]
    : after.split(">")[0];
}

const selected = (html: string, name: string, value: string) =>
  new RegExp(`<option value="${value}"[^>]*selected`).test(control(html, name));

// The radio of the choice for 29 February with this value
const radio = (html: string, value: string) =>
  html.match(new RegExp(`<input[^>]*name="birthLeapDay"[^>]*value="${value}"[^>]*>`))?.[0] ?? "";

async function birthdayInDb(name: string) {
  const { rows } = await withPool((pool) =>
    pool.query<{
      birth_day: number | null;
      birth_month: number | null;
      birth_year: number | null;
      birth_leap_day: string | null;
    }>(
      "select birth_day, birth_month, birth_year, birth_leap_day from contacts where user_id = $1 and name = $2",
      [user.id, name],
    ),
  );
  return rows;
}

function contactIdFrom(response: Response) {
  const location = response.headers.get("location") ?? "";
  const id = location.match(/\/contacts\/([0-9a-f-]{36})$/)?.[1];
  expect(id, `redirect to the card, got ${response.status} "${location}"`).toBeDefined();
  return id!;
}

beforeAll(async () => {
  user = await signInClient("birthdays");
}, 30_000);

afterAll(async () => {
  await user?.remove();
});

describe("birthday in the contact form without JavaScript", () => {
  it("shows the day, month and year fields and the choice for 29 February, 28 February ticked", async () => {
    const html = await user.getPage("/contacts/new");
    expect(visibleText(html)).toContain("День рождения");
    expect(html).toMatch(/<select[^>]*name="birthDay"/);
    expect(html).toMatch(/<select[^>]*name="birthMonth"/);
    // React puts `name` last in the tag: the year field is the input carrying it, wherever it stands
    expect(html.match(/<input[^>]*name="birthYear"[^>]*>/)?.[0]).toMatch(/inputMode="numeric"/i);
    expect(selected(html, "birthDay", "")).toBe(true);
    expect(selected(html, "birthMonth", "")).toBe(true);
    expect(visibleText(html)).toContain("В невисокосный год");
    expect(radio(html, "feb_28")).toMatch(/checked/);
    expect(radio(html, "mar_1")).not.toMatch(/checked/);
  });

  it("saves 3 March sent by a plain form post (scenario «Без JavaScript»)", async () => {
    const name = `Без JS ${marker}`;
    const response = await user.submitForm("/contacts/new", {
      ...emptyContact,
      name,
      birthDay: "3",
      birthMonth: "3",
      birthLeapDay: "feb_28",
    });
    contactIdFrom(response);
    expect(await birthdayInDb(name)).toEqual([
      { birth_day: 3, birth_month: 3, birth_year: null, birth_leap_day: null },
    ]);
  });

  it("does not keep 1 March ticked for another date (scenario «Выбор без JavaScript при другой дате»)", async () => {
    const name = `Не високосный ${marker}`;
    contactIdFrom(
      await user.submitForm("/contacts/new", {
        ...emptyContact,
        name,
        birthDay: "3",
        birthMonth: "3",
        birthLeapDay: "mar_1",
      }),
    );
    expect(await birthdayInDb(name)).toEqual([
      { birth_day: 3, birth_month: 3, birth_year: null, birth_leap_day: null },
    ]);
  });

  it("keeps everything typed on «Такой даты нет» and saves nothing (scenario «Ошибка не теряет введённое»)", async () => {
    const name = `Апрель ${marker}`;
    const response = await user.submitForm("/contacts/new", {
      ...emptyContact,
      name,
      phone: "+7 (000) 444-44-44",
      birthDay: "31",
      birthMonth: "4",
      birthLeapDay: "feb_28",
    });
    const html = await response.text();
    expect(visibleText(html)).toContain("Такой даты нет");
    expect(control(html, "name")).toContain(`value="${name}"`);
    expect(control(html, "phone")).toContain('value="+7 (000) 444-44-44"');
    expect(selected(html, "birthDay", "31")).toBe(true);
    expect(selected(html, "birthMonth", "4")).toBe(true);
    // The error marks the day and the month, not the year (mockup state «birthday-error»)
    const tag = (field: string) =>
      html.match(new RegExp(`<(?:select|input)[^>]*name="${field}"[^>]*>`))?.[0];
    expect(tag("birthDay")).toMatch(/aria-invalid="true"/);
    expect(tag("birthMonth")).toMatch(/aria-invalid="true"/);
    expect(tag("birthYear")).not.toMatch(/ aria-invalid="/);
    expect(await birthdayInDb(name)).toEqual([]);
  });

  it("opens the edit form with the saved birthday and choice", async () => {
    const name = `Високосный ${marker}`;
    const id = contactIdFrom(
      await user.submitForm("/contacts/new", {
        ...emptyContact,
        name,
        birthDay: "29",
        birthMonth: "2",
        birthYear: "1992",
        birthLeapDay: "mar_1",
      }),
    );
    const html = await user.getPage(`/contacts/${id}/edit`);
    expect(selected(html, "birthDay", "29")).toBe(true);
    expect(selected(html, "birthMonth", "2")).toBe(true);
    expect(control(html, "birthYear")).toContain('value="1992"');
    expect(radio(html, "mar_1")).toMatch(/checked/);
    expect(radio(html, "feb_28")).not.toMatch(/checked/);
  });
});

// The value of the «День рождения» row in the card's data
function cardBirthday(html: string) {
  return visibleText(html.split(">День рождения</dt>")[1]?.split("</dd>")[0] ?? "").trim();
}

describe("birthday in the contact card", () => {
  async function cardOf(name: string, birthday: Record<string, string>) {
    const id = contactIdFrom(
      await user.submitForm("/contacts/new", { ...emptyContact, name, ...birthday }),
    );
    return user.getPage(`/contacts/${id}`);
  }

  it("scenario «Карточка с датой»: 25 ноября 1990", async () => {
    const html = await cardOf(`Карточка с датой ${marker}`, {
      birthDay: "25",
      birthMonth: "11",
      birthYear: "1990",
      birthLeapDay: "feb_28",
    });
    expect(cardBirthday(html)).toBe("25 ноября 1990");
  });

  it("scenario «Карточка без даты»: a dash, like other empty data", async () => {
    const html = await cardOf(`Карточка без даты ${marker}`, { birthLeapDay: "feb_28" });
    expect(cardBirthday(html)).toBe("—");
  });

  it("scenario «Карточка с 29 февраля»: the date and the choice", async () => {
    const html = await cardOf(`Карточка 29 февраля ${marker}`, {
      birthDay: "29",
      birthMonth: "2",
      birthYear: "1992",
      birthLeapDay: "mar_1",
    });
    expect(cardBirthday(html)).toBe("29 февраля 1992 · в невисокосный год — 1 марта");
  });
});

// "Today" counted the way the app counts it; birthdays are built from it
function shiftedDate(days: number) {
  const { year, month, day } = parseDate(toDateString(new Date()));
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
    text: formatDayMonth(moved.toISOString().slice(0, 10)),
  };
}

type Seed = {
  // Days from today to the birthday; none - no birthday
  inDays?: number;
  year?: number;
  // A weekly frequency, 30 days since creation: the contact is in «Пора связаться»
  overdue?: boolean;
  groupId?: string;
};

async function insertContact(userId: string, name: string, seed: Seed = {}) {
  const date = seed.inDays === undefined ? null : shiftedDate(seed.inDays);
  const { rows } = await withPool((pool) =>
    pool.query<{ id: string }>(
      `insert into contacts (user_id, name, birth_day, birth_month, birth_year, cadence, created_at)
       values ($1, $2, $3, $4, $5, $6, now() - make_interval(days => $7)) returning id`,
      [
        userId,
        name,
        date?.day ?? null,
        date?.month ?? null,
        date ? (seed.year ?? null) : null,
        seed.overdue ? "week" : null,
        seed.overdue ? 30 : 0,
      ],
    ),
  );
  const id = rows[0].id;
  if (seed.groupId) {
    await withPool((pool) =>
      pool.query("insert into contact_groups (contact_id, group_id) values ($1, $2)", [
        id,
        seed.groupId,
      ]),
    );
  }
  return id;
}

async function insertGroup(userId: string, name: string) {
  const { rows } = await withPool((pool) =>
    pool.query<{ id: string }>("insert into groups (user_id, name) values ($1, $2) returning id", [
      userId,
      name,
    ]),
  );
  return rows[0].id;
}

const BLOCK_TITLE = 'id="birthdays-title"';

// The markup of the «Скоро день рождения» block, empty when there is none
function birthdaysBlock(html: string) {
  return html.split('aria-labelledby="birthdays-title"')[1]?.split("</section>")[0] ?? "";
}

// The block row of one contact: from its link to the end of the <li>
function blockRow(html: string, id: string) {
  return visibleText(birthdaysBlock(html).split(`href="/contacts/${id}"`)[1]?.split("</li>")[0] ?? "");
}

describe("the «Скоро день рождения» block", () => {
  // Must match PAGE_SIZE in src/server/contacts.ts
  const pageSize = 50;
  const prefix = `Блок ДР ${marker}`;
  let groupId: string;
  let annaId: string;
  let borisId: string;

  beforeAll(async () => {
    groupId = await insertGroup(user.id, `${prefix} Теннис`);
    // Anna is in the group and in «Пора связаться» too; Boris is outside the group
    annaId = await insertContact(user.id, `${prefix} Анна`, {
      inDays: 1,
      year: 1990,
      overdue: true,
      groupId,
    });
    borisId = await insertContact(user.id, `${prefix} Борис`, { inDays: 1 });
  });

  it("scenario «Над „Пора связаться“»: on the main page and on the group page", async () => {
    for (const path of ["/", `/?group=${groupId}`, `/groups/${groupId}`]) {
      const html = await user.getPage(path);
      expect(html, path).toContain(BLOCK_TITLE);
      expect(html, path).toContain('id="reminders-title"');
      expect(html.indexOf(BLOCK_TITLE), path).toBeLessThan(html.indexOf('id="reminders-title"'));
    }
  });

  it("a row reads «Завтра · <date> · исполнится <age>»", async () => {
    const tomorrow = shiftedDate(1);
    const row = blockRow(await user.getPage("/"), annaId);
    expect(row).toContain(`${prefix} Анна`);
    expect(row).toContain(`Завтра · ${tomorrow.text} · исполнится ${tomorrow.year - 1990}`);
  });

  it("scenario «Блок в группе»: with the group filter and on the group page only the group", async () => {
    for (const path of [`/?group=${groupId}`, `/groups/${groupId}`]) {
      const block = birthdaysBlock(await user.getPage(path));
      expect(block, path).toContain(`href="/contacts/${annaId}"`);
      expect(block, path).not.toContain(`href="/contacts/${borisId}"`);
    }
    expect(birthdaysBlock(await user.getPage("/"))).toContain(`href="/contacts/${borisId}"`);
  });

  it("scenario «Поиск»: no block in search, on the main page and on the group page", async () => {
    const q = encodeURIComponent("Анна");
    expect(await user.getPage(`/?q=${q}`)).not.toContain(BLOCK_TITLE);
    expect(await user.getPage(`/?group=${groupId}&q=${q}`)).not.toContain(BLOCK_TITLE);
    expect(await user.getPage(`/groups/${groupId}?q=${q}`)).not.toContain(BLOCK_TITLE);
  });

  it("scenario «Переход в карточку»: the row links to the contact's card", async () => {
    const block = birthdaysBlock(await user.getPage("/"));
    expect(block).toContain(`href="/contacts/${annaId}"`);
    expect(visibleText(await user.getPage(`/contacts/${annaId}`))).toContain(`${prefix} Анна`);
  });

  it("the search form stands above both blocks, on the main page and on the group page (decision 42)", async () => {
    for (const path of ["/", `/?group=${groupId}`, `/groups/${groupId}`]) {
      const html = await user.getPage(path);
      const search = html.indexOf('role="search"');
      expect(search, path).toBeGreaterThan(-1);
      expect(search, path).toBeLessThan(html.indexOf(BLOCK_TITLE));
      expect(search, path).toBeLessThan(html.indexOf('id="reminders-title"'));
    }
  });

  // Last: it adds a page of contacts
  it("scenario «Вторая страница списка»: no block on page 2", async () => {
    // A second page must exist: a missing page is shown as page 1, which has the block
    await withPool((pool) =>
      pool.query(
        "insert into contacts (user_id, name) select $3, $1 || ' страница ' || n from generate_series(1, $2::int) n",
        [prefix, pageSize, user.id],
      ),
    );
    expect(await user.getPage("/?page=2")).not.toContain(BLOCK_TITLE);
    expect(await user.getPage("/")).toContain(BLOCK_TITLE);
  });
});

describe("no block without birthdays in the window", () => {
  // A user of its own: the user above has birthdays in the window
  let other: Awaited<ReturnType<typeof signInClient>>;

  beforeAll(async () => {
    other = await signInClient("birthdays-none");
    // Someone in «Пора связаться»: the rest of the page stays as before
    await insertContact(other.id, `Без ДР ${marker} просрочен`, { overdue: true });
  }, 30_000);

  afterAll(async () => {
    await other?.remove();
  });

  it("scenario «Дат рождения нет ни у кого»: no block", async () => {
    const html = await other.getPage("/");
    expect(html).not.toContain(BLOCK_TITLE);
    expect(html).toContain('id="reminders-title"');
  });

  it("scenario «Никого в окне»: birthdays 2 days ago and in 8 days give no block", async () => {
    await insertContact(other.id, `Без ДР ${marker} позавчера`, { inDays: -2, year: 1990 });
    await insertContact(other.id, `Без ДР ${marker} через 8 дней`, { inDays: 8 });
    const html = await other.getPage("/");
    expect(html).not.toContain(BLOCK_TITLE);
    expect(html).toContain('id="reminders-title"');
    expect(visibleText(html)).toContain("Всего: 3");
  });
});
