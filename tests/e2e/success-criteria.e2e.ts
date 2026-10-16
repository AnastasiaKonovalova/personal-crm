import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

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
});
