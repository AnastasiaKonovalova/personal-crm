import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { loginLinks, removeUser, uniqueEmail } from "../e2e/auth";
import { signInInBrowser } from "./sign-in";

// Main scenario of sign-in for two users (specs/02-пользователи-вход.md, user-auth «A и B»), in a real
// browser with sign-in links from Mailpit: A signs in and adds a contact; B signs in in another browser
// context and sees neither the contact in the list nor in search, and A's contact by a direct link is the
// same screen as a contact that does not exist. Plus «Кнопка на экране устаревшей ссылки».
// Separate from main-scenario.spec.ts on purpose (the spec asks for it).

const marker = randomUUID().slice(0, 8);
const contactName = `Чужой Контакт ${marker}`;
const emailA = uniqueEmail("user-a");
const emailB = uniqueEmail("user-b");
const emailExpired = uniqueEmail("expired");

test.afterAll(async () => {
  // Each user goes with their contacts, sign-in rows and emails
  await removeUser(emailA);
  await removeUser(emailB);
  await removeUser(emailExpired);
});

test("A and B: B does not see A's contact in the list, in search or by a direct link", async ({
  page,
  browser,
}) => {
  let contactId = "";

  await test.step("A signed in by a link and added a contact", async () => {
    await signInInBrowser(page, emailA);
    await page.getByRole("link", { name: "Добавить контакт" }).click();
    await page.getByLabel("Имя").fill(contactName);
    await page.getByLabel("Кто это").fill("Проверка разделения данных");
    await page.getByLabel("Откуда знакомы").fill("Автотест");
    await page.getByRole("button", { name: "Сохранить" }).click();

    await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]{36}$/);
    contactId = page.url().split("/").pop() ?? "";
    await expect(page.getByRole("heading", { name: contactName })).toBeVisible();
  });

  const contextB = await browser.newContext();
  try {
    const pageB = await contextB.newPage();

    await test.step("B signed in by own link in another browser → the list has no A's contact", async () => {
      await signInInBrowser(pageB, emailB);
      await expect(pageB.getByText("Всего: 0")).toBeVisible();
      await expect(pageB.getByText("Контактов пока нет")).toBeVisible();
      await expect(pageB.getByRole("link", { name: contactName })).toHaveCount(0);
    });

    await test.step("B searched A's contact by name → nobody found", async () => {
      await pageB.getByPlaceholder("Поиск по имени").fill(contactName);
      await pageB.getByRole("button", { name: "Найти" }).click();

      await expect(
        pageB.getByRole("heading", { name: `По запросу «${contactName}» никого не нашлось` }),
      ).toBeVisible();
      await expect(pageB.getByRole("link", { name: contactName })).toHaveCount(0);
    });

    await test.step("B opened A's contact by a direct link → the screen of a contact that does not exist", async () => {
      await pageB.goto(`/contacts/${randomUUID()}`);
      await expect(pageB.getByRole("heading", { name: "Не нашлось" })).toBeVisible();
      const missingScreen = await pageB.getByRole("main").innerText();

      await pageB.goto(`/contacts/${contactId}`);
      await expect(pageB.getByRole("heading", { name: "Не нашлось" })).toBeVisible();
      expect(await pageB.getByRole("main").innerText()).toBe(missingScreen);
      await expect(pageB.getByText(contactName)).toHaveCount(0);
    });
  } finally {
    await contextB.close();
  }

  await test.step("A still sees the contact", async () => {
    await page.goto(`/contacts/${contactId}`);
    await expect(page.getByRole("heading", { name: contactName })).toBeVisible();
  });
});

test("the button on the expired-link screen opens the sign-in page", async ({ page, browser }) => {
  // A link used for sign-in, opened again in a browser without a session, leads to «Ссылка устарела»
  await signInInBrowser(page, emailExpired);
  const [usedLink] = await loginLinks(emailExpired);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(usedLink);
    await expect(page).toHaveURL(/\/login\/expired/);
    await expect(
      page.getByRole("heading", { name: "Ссылка устарела, запроси новую" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Запросить новую ссылку" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel("Почта")).toBeVisible();
    await expect(page.getByRole("button", { name: "Получить ссылку" })).toBeVisible();
  } finally {
    await context.close();
  }
});
