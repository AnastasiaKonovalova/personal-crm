import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";

// Main scenario and success criteria from specs/01-продуктовая-идея.md, in a real browser:
// opened → list of all contacts; added a contact → found it by name → added a note → saved
// on the card; opened the same address in another browser → the same data.

const marker = randomUUID().slice(0, 8);
const contactName = `Проверка Браузерная ${marker}`;
const noteText = `Обсудили поход в горы, договорились созвониться ${marker}`;
let contactId: string | undefined;

async function withPool<T>(run: (pool: Pool) => Promise<T>) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

test.afterAll(async () => {
  if (contactId) {
    // Remove only the contact this test created; its notes go away via ON DELETE CASCADE
    await withPool((pool) => pool.query("delete from contacts where id = $1", [contactId]));
  }
});

test("main scenario: open → add contact → find by name → add note → saved for another browser", async ({
  page,
  browser,
}) => {
  await test.step("opened → the list shows the total of all contacts", async () => {
    const { rows } = await withPool((pool) =>
      pool.query<{ total: number }>("select count(*)::int as total from contacts"),
    );
    await page.goto("/");
    await expect(page.getByText(`Всего: ${rows[0].total}`)).toBeVisible();
  });

  await test.step("added a contact → its card opens", async () => {
    await page.getByRole("link", { name: "Добавить контакт" }).click();
    await page.getByLabel("Имя").fill(contactName);
    await page.getByLabel("Кто это").fill("Браузерная проверка");
    await page.getByLabel("Откуда знакомы").fill("Автотест");
    await page.getByRole("button", { name: "Сохранить" }).click();

    await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]{36}$/);
    contactId = page.url().split("/").pop();
    await expect(page.getByRole("heading", { name: contactName })).toBeVisible();
  });

  await test.step("found it by part of the name in lower case → opened the card", async () => {
    await page.goto("/");
    await page.getByPlaceholder("Поиск по имени").fill(`браузерная ${marker}`);
    await page.getByRole("button", { name: "Найти" }).click();

    await expect(page.getByText("Найдено: 1")).toBeVisible();
    await page.getByRole("link", { name: contactName }).click();
    await expect(page).toHaveURL(new RegExp(`/contacts/${contactId}$`));
  });

  await test.step("added a note → it is saved on the card", async () => {
    await page.getByLabel("Новая заметка").fill(noteText);
    await page.getByRole("button", { name: "Добавить заметку" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Заметка сохранена" })).toBeVisible();

    await page.reload();
    await expect(page.getByText(noteText)).toBeVisible();
  });

  await test.step("another browser sees the same contact and note", async () => {
    const other = await browser.newContext();
    try {
      const otherPage = await other.newPage();
      await otherPage.goto(`/?q=${encodeURIComponent(contactName)}`);
      await expect(otherPage.getByRole("link", { name: contactName })).toBeVisible();

      await otherPage.goto(`/contacts/${contactId}`);
      await expect(otherPage.getByText(noteText)).toBeVisible();
    } finally {
      await other.close();
    }
  });
});
