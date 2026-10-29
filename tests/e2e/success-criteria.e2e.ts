import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Success criteria from the spec, checked over HTTP against a running app.
// Forms are submitted the way a browser without JavaScript does it.
// Run: `pnpm build && pnpm start`, then `pnpm test:e2e`.

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const marker = randomUUID().slice(0, 8);
const contactName = `Проверка Сквозная ${marker}`;
const noteText = `Обсудили выставку, договорились созвониться ${marker}`;
let contactId: string | undefined;

const htmlEntities: Record<string, string> = {
  "&quot;": '"',
  "&amp;": "&",
  "&#x27;": "'",
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

function decodeHtml(value: string) {
  return value.replace(/&(?:quot|amp|#x27|#39|lt|gt);/g, (entity) => htmlEntities[entity]);
}

async function withPool<T>(run: (pool: Pool) => Promise<T>) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

// Every request is a fresh client without cookies or cache, like opening the page in another browser
async function getPage(path: string) {
  const response = await fetch(new URL(path, baseUrl), { redirect: "manual" });
  expect(response.status, `GET ${path}`).toBe(200);
  return response.text();
}

async function submitForm(path: string, fields: Record<string, string>) {
  const html = await getPage(path);
  const form = html.match(/<form[^>]*method="POST"[^>]*>([\s\S]*?)<\/form>/);
  expect(form, `POST form on ${path}`).not.toBeNull();

  const body = new FormData();
  for (const [, key, value = ""] of form![1].matchAll(
    /<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/?>/g,
  )) {
    body.append(key, decodeHtml(value));
  }
  for (const [key, value] of Object.entries(fields)) {
    body.append(key, value);
  }

  return fetch(new URL(path, baseUrl), {
    method: "POST",
    body,
    redirect: "manual",
    headers: { Origin: new URL(baseUrl).origin },
    signal: AbortSignal.timeout(10_000),
  });
}

afterAll(async () => {
  if (contactId) {
    // Remove only the contact this test created; its notes go away via ON DELETE CASCADE
    await withPool((pool) => pool.query("delete from contacts where id = $1", [contactId]));
  }
});

describe("success criteria over HTTP", () => {
  it("opened → the list shows the total of all contacts in the database", async () => {
    const { rows } = await withPool((pool) =>
      pool.query<{ total: number }>("select count(*)::int as total from contacts"),
    );
    expect(await getPage("/")).toContain(`Всего: ${rows[0].total}`);
  });

  it("added a contact → redirected to its saved card", async () => {
    const response = await submitForm("/contacts/new", {
      name: contactName,
      about: "Сквозная проверка",
      howWeMet: "Автотест",
      phone: "",
      email: "",
    });
    const location = response.headers.get("location") ?? "";
    const match = location.match(/\/contacts\/([0-9a-f-]{36})$/);
    expect(match, `redirect to the card, got ${response.status} "${location}"`).not.toBeNull();
    contactId = match![1];

    expect(await getPage(`/contacts/${contactId}`)).toContain(contactName);
  });

  it("found it by part of the name in lower case", async () => {
    const html = await getPage(`/?q=${encodeURIComponent(`сквозная ${marker}`)}`);
    expect(html).toContain("Найдено: 1");
    expect(html).toContain(`href="/contacts/${contactId}"`);
  });

  it("added a note → another client sees it on the card", async () => {
    expect(contactId).toBeDefined();
    const response = await submitForm(`/contacts/${contactId}`, { body: noteText });
    expect(response.status, "note form submission").toBe(200);
    expect(await response.text()).toContain("Заметка сохранена");

    expect(await getPage(`/contacts/${contactId}`)).toContain(noteText);
  });

  it("edited the contact → the card shows the new data", async () => {
    expect(contactId).toBeDefined();
    const editedName = `Проверка Сквозная Фёдорова ${marker}`;
    const response = await submitForm(`/contacts/${contactId}/edit`, {
      name: editedName,
      about: "Отредактировано",
      howWeMet: "Автотест",
      phone: "",
      email: "",
    });
    const location = response.headers.get("location") ?? "";
    expect(location, `redirect to the card, got ${response.status}`).toMatch(
      new RegExp(`/contacts/${contactId}$`),
    );

    const card = await getPage(`/contacts/${contactId}`);
    expect(card).toContain(editedName);
    expect(card).toContain("Отредактировано");
  });

  it("found the «ё» name by a query with «е»", async () => {
    const html = await getPage(`/?q=${encodeURIComponent(`федорова ${marker}`)}`);
    expect(html).toContain("Найдено: 1");
    expect(html).toContain(`href="/contacts/${contactId}"`);
  });

  // The confirm dialog renders only once opened in a browser, so the delete itself is a manual check
  it("the card has a «Удалить» button that opens a dialog", async () => {
    expect(contactId).toBeDefined();
    const card = await getPage(`/contacts/${contactId}`);
    expect(card).toContain('aria-haspopup="dialog"');
    expect(visibleText(card)).toContain("Удалить");
  });

  it("after a delete the list says «Контакт удалён»", async () => {
    expect(visibleText(await getPage("/?deleted=1"))).toContain("Контакт удалён");
    expect(visibleText(await getPage("/"))).not.toContain("Контакт удалён");
  });
});

// Must match PAGE_SIZE in src/server/contacts.ts
const pageSize = 50;
const pagerMarker = randomUUID().slice(0, 8);
const pagerPrefix = `Пагинация Проверка ${pagerMarker}`;

// Opening tag of the pagination arrow with this aria-label (<a> when active, <span> when not)
function arrowTag(html: string, label: string) {
  return [...html.matchAll(/<(a|span)\b[^>]*>/g)].find(([tag]) =>
    tag.includes(`aria-label="${label}"`),
  );
}

function arrowHref(html: string, label: string) {
  const href = arrowTag(html, label)?.[0].match(/href="([^"]*)"/)?.[1];
  return href === undefined ? undefined : decodeHtml(href);
}

function visibleText(html: string) {
  return html.replace(/<[^>]+>/g, "");
}

describe("pagination", () => {
  // One page and one more contact, all with a shared marker so a search returns exactly them
  beforeAll(async () => {
    await withPool((pool) =>
      pool.query(
        "insert into contacts (name, about) select $1 || ' ' || lpad(n::text, 2, '0'), 'Проверка страниц' from generate_series(1, $2::int) n",
        [pagerPrefix, pageSize + 1],
      ),
    );
  });

  afterAll(async () => {
    await withPool((pool) => pool.query("delete from contacts where name like $1", [`${pagerPrefix} %`]));
  });

  it("the full list shows the page count of all contacts", async () => {
    const { rows } = await withPool((pool) =>
      pool.query<{ total: number }>("select count(*)::int as total from contacts"),
    );
    const pageCount = Math.ceil(rows[0].total / pageSize);
    const html = await getPage("/");
    expect(visibleText(html)).toContain(`Страница 1 из ${pageCount}`);
    expect(arrowHref(html, "Вперёд")).toBe("/?page=2");
  });

  it("search results are paged and the query stays in the page links", async () => {
    const first = await getPage(`/?q=${pagerMarker}`);
    expect(visibleText(first)).toContain("Страница 1 из 2");
    expect(first).toContain(`${pagerPrefix} 01`);
    expect(first).not.toContain(`${pagerPrefix} ${pageSize + 1}`);
    expect(arrowTag(first, "Назад")?.[0]).toContain('aria-disabled="true"');
    expect(arrowHref(first, "Вперёд")).toBe(`/?q=${pagerMarker}&page=2`);

    const second = await getPage(`/?q=${pagerMarker}&page=2`);
    expect(visibleText(second)).toContain("Страница 2 из 2");
    expect(second).toContain(`${pagerPrefix} ${pageSize + 1}`);
    expect(second).not.toContain(`${pagerPrefix} 01`);
    expect(arrowHref(second, "Назад")).toBe(`/?q=${pagerMarker}`);
    expect(arrowTag(second, "Вперёд")?.[1]).toBe("span");
    expect(arrowTag(second, "Вперёд")?.[0]).toContain('aria-disabled="true"');
  });
});
