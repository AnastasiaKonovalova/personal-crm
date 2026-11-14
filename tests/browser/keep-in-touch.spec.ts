import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

// The «Пора связаться» block in a real browser: what only JavaScript does (expand, collapse,
// paging, «Связались» in place) and what CSS hides without it.
// Every test seeds its own group: on the group page the block holds only that group's contacts,
// so the counts do not depend on what else is in the database.

const marker = randomUUID().slice(0, 8);
const prefix = `Блок ${marker}`;

type Seeded = { groupId: string; contacts: { id: string; name: string }[] };

async function withPool<T>(run: (pool: Pool) => Promise<T>) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

// A group of `count` weekly contacts, all 30 days since creation: equally overdue, so the block
// orders them by name, «… 01» first
async function seedGroup(label: string, count: number): Promise<Seeded> {
  const { rows } = await withPool((pool) =>
    pool.query<{ group_id: string; id: string; name: string }>(
      `with g as (insert into groups (name) values ($1) returning id),
            c as (insert into contacts (name, cadence, created_at)
                  select $1 || ' ' || lpad(n::text, 2, '0'), 'week', now() - interval '30 days'
                  from generate_series(1, $2::int) n
                  returning id, name),
            l as (insert into contact_groups (contact_id, group_id) select c.id, g.id from c, g)
       select (select id from g) as group_id, c.id, c.name from c order by c.name`,
      [`${prefix} ${label}`, count],
    ),
  );
  return { groupId: rows[0].group_id, contacts: rows.map(({ id, name }) => ({ id, name })) };
}

test.afterAll(async () => {
  // Notes and memberships go with them: ON DELETE CASCADE
  await withPool(async (pool) => {
    await pool.query("delete from contacts where name like $1", [`${prefix} %`]);
    await pool.query("delete from groups where name like $1", [`${prefix} %`]);
  });
});

const block = (page: Page) => page.getByRole("region", { name: "Пора связаться" });
const visibleRows = (page: Page) => block(page).locator("li:visible");
const blockPager = (page: Page) =>
  page.getByRole("navigation", { name: "Страницы блока «Пора связаться»" });

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

// The contact links of the shared list under the block, as the owner sees them
async function listLinks(page: Page) {
  return page
    .locator('a[href^="/contacts/"]:not(section[aria-labelledby="reminders-title"] a)')
    .evaluateAll((links) =>
      links
        .map((link) => link.getAttribute("href") ?? "")
        .filter((href) => /^\/contacts\/[0-9a-f-]{36}$/.test(href)),
    );
}

async function expectVisibleNames(page: Page, names: string[]) {
  await expect(visibleRows(page)).toHaveCount(names.length);
  for (const [index, name] of names.entries()) {
    await expect(visibleRows(page).nth(index)).toContainText(name);
  }
}

test("8 contacts: first 5 and «Показать все (8)», expanded all 8 without a pager, collapsed back", async ({
  page,
}) => {
  const { groupId, contacts } = await seedGroup("восемь", 8);
  const names = contacts.map((contact) => contact.name);
  await page.goto(`/groups/${groupId}`);
  await markPage(page);
  const calls = trackServerCalls(page);

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

test("23 contacts: pages of 10 in place, the shared list stays, expanding again opens page 1", async ({
  page,
}) => {
  const { groupId, contacts } = await seedGroup("листание", 23);
  const names = contacts.map((contact) => contact.name);
  await page.goto(`/groups/${groupId}`);
  await markPage(page);
  const calls = trackServerCalls(page);
  const listBefore = await listLinks(page);
  expect(listBefore).toHaveLength(23);

  await block(page).getByRole("button", { name: "Показать все (23)" }).click();
  await expectVisibleNames(page, names.slice(0, 10));
  await expect(blockPager(page)).toContainText("Страница 1 из 3");
  await expect(blockPager(page).getByRole("button", { name: "Назад" })).toBeDisabled();

  await blockPager(page).getByRole("button", { name: "Вперёд" }).click();
  await expectVisibleNames(page, names.slice(10, 20));
  await expect(blockPager(page)).toContainText("Страница 2 из 3");
  expect(await listLinks(page)).toEqual(listBefore);

  await blockPager(page).getByRole("button", { name: "Вперёд" }).click();
  await expectVisibleNames(page, names.slice(20));
  await expect(blockPager(page)).toContainText("Страница 3 из 3");
  await expect(blockPager(page).getByRole("button", { name: "Вперёд" })).toBeDisabled();

  await block(page).getByRole("button", { name: "Свернуть" }).click();
  await block(page).getByRole("button", { name: "Показать все (23)" }).click();
  await expectVisibleNames(page, names.slice(0, 10));
  await expect(blockPager(page)).toContainText("Страница 1 из 3");

  await expectNotReloaded(page);
  expect(calls).toEqual([]);
});

test("without JavaScript the block shows all 23 rows, no buttons and no pager", async ({
  browser,
}) => {
  const { groupId, contacts } = await seedGroup("без JS", 23);
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`/groups/${groupId}`);

    await expectVisibleNames(
      page,
      contacts.map((contact) => contact.name),
    );
    await expect(block(page).getByRole("button", { name: /Показать все/ })).toBeHidden();
    await expect(block(page).getByRole("button", { name: "Свернуть" })).toBeHidden();
    await expect(blockPager(page)).toBeHidden();
  } finally {
    await context.close();
  }
});

test("«Связались» on page 2 of the expanded block: the row leaves in place, the block stays on page 2", async ({
  page,
}) => {
  const { groupId, contacts } = await seedGroup("страница 2", 23);
  const names = contacts.map((contact) => contact.name);
  await page.goto(`/groups/${groupId}`);
  await markPage(page);

  await block(page).getByRole("button", { name: "Показать все (23)" }).click();
  await blockPager(page).getByRole("button", { name: "Вперёд" }).click();
  await block(page)
    .getByRole("button", { name: `Связались: ${names[11]}` })
    .click();

  await expect(block(page).getByRole("link", { name: names[11] })).toHaveCount(0);
  await expect(blockPager(page)).toContainText("Страница 2 из 3");
  await expectVisibleNames(page, [names[10], ...names.slice(12, 21)]);

  await block(page).getByRole("button", { name: "Свернуть" }).click();
  await expect(block(page).getByRole("button", { name: "Показать все (22)" })).toBeVisible();
  await expectNotReloaded(page);
});

test("«Связались» leaves 5 rows: the expanded block drops its buttons", async ({ page }) => {
  const { groupId, contacts } = await seedGroup("раскрыт шесть", 6);
  const names = contacts.map((contact) => contact.name);
  await page.goto(`/groups/${groupId}`);
  await markPage(page);

  await block(page).getByRole("button", { name: "Показать все (6)" }).click();
  await block(page)
    .getByRole("button", { name: `Связались: ${names[0]}` })
    .click();

  await expectVisibleNames(page, names.slice(1));
  await expect(block(page).getByRole("button", { name: "Свернуть" })).toHaveCount(0);
  await expect(block(page).getByRole("button", { name: /Показать все/ })).toHaveCount(0);
  await expectNotReloaded(page);
});

test("«Связались» leaves 5 rows: the collapsed block drops «Показать все»", async ({ page }) => {
  const { groupId, contacts } = await seedGroup("свёрнут шесть", 6);
  const names = contacts.map((contact) => contact.name);
  await page.goto(`/groups/${groupId}`);
  await markPage(page);

  await block(page)
    .getByRole("button", { name: `Связались: ${names[2]}` })
    .click();

  await expectVisibleNames(page, [...names.slice(0, 2), ...names.slice(3)]);
  await expect(block(page).getByRole("button", { name: /Показать все/ })).toHaveCount(0);
  await expectNotReloaded(page);
});

test("«Связались» at the last contact shows «Со всеми на связи» with the icon", async ({
  page,
}) => {
  const { groupId, contacts } = await seedGroup("последний", 1);
  await page.goto(`/groups/${groupId}`);
  await markPage(page);

  await block(page)
    .getByRole("button", { name: `Связались: ${contacts[0].name}` })
    .click();

  await expect(block(page)).toContainText("Со всеми на связи");
  await expect(block(page).locator("svg")).toBeVisible();
  await expect(block(page).getByRole("listitem")).toHaveCount(0);
  await expectNotReloaded(page);
});

test("a click on the name in a block row opens the card", async ({ page }) => {
  const { groupId, contacts } = await seedGroup("переход", 1);
  await page.goto(`/groups/${groupId}`);

  await block(page).getByRole("link", { name: contacts[0].name }).click();

  await expect(page).toHaveURL(new RegExp(`/contacts/${contacts[0].id}$`));
  await expect(page.getByRole("heading", { name: contacts[0].name })).toBeVisible();
});

test("«Связались» in the card puts the note on top of the feed", async ({ page }) => {
  const { contacts } = await seedGroup("карточка", 1);
  const contact = contacts[0];
  await withPool((pool) =>
    pool.query(
      "insert into notes (contact_id, body, created_at) values ($1, $2, now() - interval '3 days')",
      [contact.id, "Старая заметка"],
    ),
  );
  await page.goto(`/contacts/${contact.id}`);

  await page
    .getByRole("region", { name: "Связь с контактом" })
    .getByRole("button", { name: "Связались" })
    .click();

  const notes = page.getByTestId("notes").getByRole("listitem");
  await expect(notes).toHaveCount(2);
  await expect(notes.first()).toContainText("Связались");
  await expect(notes.last()).toContainText("Старая заметка");
});

test("the dot pulses, and stops under prefers-reduced-motion", async ({ page }) => {
  const { groupId } = await seedGroup("пульс", 1);
  await page.goto(`/groups/${groupId}`);
  const dot = page.locator(".animate-due-overdue").last();
  const animation = () => dot.evaluate((element) => getComputedStyle(element).animationName);

  expect(await animation()).not.toBe("none");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await animation()).toBe("none");
});
