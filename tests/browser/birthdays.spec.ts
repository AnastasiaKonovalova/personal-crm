import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { parseDate, toDateString } from "../../src/lib/keep-in-touch";
import { signIn, withPool, type SignedInUser } from "../e2e/auth";
import { useSession } from "./sign-in";

// Birthdays in a real browser: what only JavaScript does. One user of this file, signed in over HTTP;
// every browser context gets the session cookie. The form is never submitted; the block tests seed
// their contacts in the database, each in a group of its own, so the counts on the group page do not
// depend on what else the user has.

const marker = randomUUID().slice(0, 8);
const prefix = `ДР ${marker}`;
let user: SignedInUser;

test.beforeAll(async () => {
  user = await signIn("birthdays-browser");
});

test.beforeEach(async ({ context }) => {
  await useSession(context, user.cookie);
});

test.afterAll(async () => {
  // The user goes with the contacts and groups; memberships follow by cascade
  await user?.remove();
});

test("the choice for 29 February shows only at 29 February (scenario «Выбор виден только при 29 февраля»)", async ({
  page,
}) => {
  await page.goto("/contacts/new");
  const choice = page.getByRole("group", { name: "В невисокосный год" });
  const day = page.getByLabel("День", { exact: true });
  const month = page.getByLabel("Месяц", { exact: true });

  // Nothing chosen: no choice
  await expect(choice).toBeHidden();

  await day.selectOption("3");
  await month.selectOption("3");
  await expect(choice).toBeHidden();

  await day.selectOption("29");
  await month.selectOption("2");
  await expect(choice).toBeVisible();
  await expect(choice.getByLabel("28 февраля")).toBeChecked();

  // 29 of another month: hidden again
  await month.selectOption("3");
  await expect(choice).toBeHidden();
});

// A group of `count` contacts, all with the birthday tomorrow (so the block orders them by name,
// «… 01» first) and all overdue weekly, so «Пора связаться» holds them too
async function seedGroup(label: string, count: number) {
  const { year, month, day } = parseDate(toDateString(new Date()));
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
  const { rows } = await withPool((pool) =>
    pool.query<{ group_id: string; name: string }>(
      `with g as (insert into groups (user_id, name) values ($3, $1) returning id),
            c as (insert into contacts (user_id, name, birth_day, birth_month, cadence, created_at)
                  select $3, $1 || ' ' || lpad(n::text, 2, '0'), $4, $5, 'week', now() - interval '30 days'
                  from generate_series(1, $2::int) n
                  returning id, name),
            l as (insert into contact_groups (contact_id, group_id) select c.id, g.id from c, g)
       select (select id from g) as group_id, c.name from c order by c.name`,
      [`${prefix} ${label}`, count, user.id, tomorrow.getUTCDate(), tomorrow.getUTCMonth() + 1],
    ),
  );
  return { groupId: rows[0].group_id, names: rows.map((row) => row.name) };
}

const block = (page: Page) => page.getByRole("region", { name: "Скоро день рождения" });
const visibleRows = (page: Page) => block(page).locator("li:visible");
const blockPager = (page: Page) =>
  page.getByRole("navigation", { name: "Страницы блока «Скоро день рождения»" });
const reminderRows = (page: Page) =>
  page.getByRole("region", { name: "Пора связаться" }).locator("li:visible");

// A flag on window survives everything but a page reload
async function markPage(page: Page) {
  await page.evaluate(() => Object.assign(window, { __notReloaded: true }));
}
async function expectNotReloaded(page: Page) {
  expect(await page.evaluate(() => "__notReloaded" in window)).toBe(true);
}

// Requests to the server other than link prefetches, which Next makes for links scrolled into view
function trackServerCalls(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => {
    const headers = request.headers();
    const isPrefetch = "next-router-prefetch" in headers;
    if (
      request.resourceType() === "document" ||
      request.method() !== "GET" ||
      ("rsc" in headers && !isPrefetch)
    ) {
      calls.push(`${request.method()} ${request.url()}`);
    }
  });
  return calls;
}

// The contact links of the shared list under the blocks
async function listLinks(page: Page) {
  return page
    .locator(
      'a[href^="/contacts/"]:not(section[aria-labelledby="birthdays-title"] a):not(section[aria-labelledby="reminders-title"] a)',
    )
    .evaluateAll((links) =>
      links
        .map((link) => link.getAttribute("href") ?? "")
        .filter((href) => /^\/contacts\/[0-9a-f-]{36}$/.test(href)),
    );
}

async function visibleTexts(rows: ReturnType<typeof visibleRows>) {
  return rows.evaluateAll((items) => items.map((item) => item.textContent ?? ""));
}

async function expectVisibleNames(page: Page, names: string[]) {
  await expect(visibleRows(page)).toHaveCount(names.length);
  for (const [index, name] of names.entries()) {
    await expect(visibleRows(page).nth(index)).toContainText(name);
  }
}

test("scenarios «Больше пяти» and «Свернуть»: 8 at the title, 5 rows, all 8 in place, back to 5", async ({
  page,
}) => {
  const { groupId, names } = await seedGroup("восемь", 8);
  await page.goto(`/groups/${groupId}`);
  await markPage(page);
  const calls = trackServerCalls(page);

  await expect(block(page).getByRole("heading")).toContainText("Скоро день рождения");
  await expect(block(page)).toContainText("8");
  await expectVisibleNames(page, names.slice(0, 5));
  await block(page).getByRole("button", { name: "Показать все (8)" }).click();

  await expectVisibleNames(page, names);
  await expect(block(page).getByRole("button", { name: "Свернуть" })).toBeVisible();
  await expect(blockPager(page)).toHaveCount(0);

  await block(page).getByRole("button", { name: "Свернуть" }).click();
  await expectVisibleNames(page, names.slice(0, 5));
  await expect(block(page).getByRole("button", { name: "Показать все (8)" })).toBeVisible();

  await expectNotReloaded(page);
  expect(calls).toEqual([]);
});

test("scenarios «Много дней рождения», «Листание блока», «Повторное раскрытие»: 14 in pages of 10", async ({
  page,
}) => {
  const { groupId, names } = await seedGroup("листание", 14);
  await page.goto(`/groups/${groupId}`);
  await markPage(page);
  const calls = trackServerCalls(page);
  const listBefore = await listLinks(page);
  expect(listBefore).toHaveLength(14);
  const remindersBefore = await visibleTexts(reminderRows(page));
  expect(remindersBefore).toHaveLength(5);

  await block(page).getByRole("button", { name: "Показать все (14)" }).click();
  await expectVisibleNames(page, names.slice(0, 10));
  await expect(blockPager(page)).toContainText("Страница 1 из 2");
  await expect(blockPager(page).getByRole("button", { name: "Назад" })).toBeDisabled();

  await blockPager(page).getByRole("button", { name: "Вперёд" }).click();
  await expectVisibleNames(page, names.slice(10));
  await expect(blockPager(page)).toContainText("Страница 2 из 2");
  await expect(blockPager(page).getByRole("button", { name: "Вперёд" })).toBeDisabled();
  // Paging one block leaves the shared list and the other block alone
  expect(await listLinks(page)).toEqual(listBefore);
  expect(await visibleTexts(reminderRows(page))).toEqual(remindersBefore);

  await block(page).getByRole("button", { name: "Свернуть" }).click();
  await block(page).getByRole("button", { name: "Показать все (14)" }).click();
  await expectVisibleNames(page, names.slice(0, 10));
  await expect(blockPager(page)).toContainText("Страница 1 из 2");

  await expectNotReloaded(page);
  expect(calls).toEqual([]);
});

test("scenario «Поздравил(а)»: the row leaves in place, the expansion drops at 5, the note is in the card", async ({
  page,
}) => {
  const { groupId, names } = await seedGroup("поздравил", 6);
  await page.goto(`/groups/${groupId}`);
  await markPage(page);

  await block(page).getByRole("button", { name: "Показать все (6)" }).click();
  await expectVisibleNames(page, names);
  await block(page)
    .getByRole("button", { name: `Поздравил(а): ${names[0]}` })
    .click();

  await expect(block(page).getByRole("link", { name: names[0] })).toHaveCount(0);
  await expectVisibleNames(page, names.slice(1));
  await expect(block(page).getByRole("button", { name: "Свернуть" })).toHaveCount(0);
  await expect(block(page).getByRole("button", { name: /Показать все/ })).toHaveCount(0);
  // Counted as «Связались»: the contact leaves «Пора связаться» too
  await expect(
    page.getByRole("region", { name: "Пора связаться" }).getByRole("link", { name: names[0] }),
  ).toHaveCount(0);
  await expectNotReloaded(page);

  const { rows } = await withPool((pool) =>
    pool.query<{ id: string }>("select id from contacts where user_id = $1 and name = $2", [
      user.id,
      names[0],
    ]),
  );
  await page.goto(`/contacts/${rows[0].id}`);
  await expect(page.getByTestId("notes")).toContainText("Поздравил(а)");
});

test("scenario «Браузер без JavaScript»: all 14 rows, no buttons and no pager", async ({
  browser,
}) => {
  const { groupId, names } = await seedGroup("без JS", 14);
  const context = await browser.newContext({ javaScriptEnabled: false });
  await useSession(context, user.cookie);
  try {
    const page = await context.newPage();
    await page.goto(`/groups/${groupId}`);

    await expectVisibleNames(page, names);
    await expect(block(page).getByRole("button", { name: /Показать все/ })).toBeHidden();
    await expect(block(page).getByRole("button", { name: "Свернуть" })).toBeHidden();
    await expect(blockPager(page)).toBeHidden();
  } finally {
    await context.close();
  }
});
