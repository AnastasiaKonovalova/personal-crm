import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getPage, submitForm, visibleText, withPool } from "./helpers";

// "Keep in touch" over HTTP against a running app, forms sent the way a browser without
// JavaScript does it. Run: `pnpm build && pnpm start`, then `pnpm test:e2e`.

const marker = randomUUID().slice(0, 8);
const prefix = `Проверка Связь ${marker}`;
const contactName = `${prefix} основной`;
const BULK_COUNT = 7;
let contactId: string | undefined;

function countOf(html: string, text: string) {
  return html.split(text).length - 1;
}

// The block row of one contact: from its link to the end of the <li>
function blockRow(html: string, id: string) {
  return visibleText(html.split(`href="/contacts/${id}"`)[1]?.split("</li>")[0] ?? "");
}

async function noteBodies(id: string) {
  const { rows } = await withPool((pool) =>
    pool.query<{ body: string }>("select body from notes where contact_id = $1 order by created_at", [id]),
  );
  return rows.map((row) => row.body);
}

afterAll(async () => {
  // Notes go with the contacts: notes.contact_id is ON DELETE CASCADE
  await withPool((pool) => pool.query("delete from contacts where name like $1", [`${prefix} %`]));
});

describe("keep in touch over HTTP", () => {
  it("creates a contact with the weekly frequency", async () => {
    const response = await submitForm("/contacts/new", {
      name: contactName,
      about: "",
      howWeMet: "",
      phone: "",
      email: "",
      cadence: "week",
      contactOn: "",
    });
    const location = response.headers.get("location") ?? "";
    const match = location.match(/\/contacts\/([0-9a-f-]{36})$/);
    expect(match, `redirect to the card, got ${response.status} "${location}"`).not.toBeNull();
    contactId = match![1];

    const { rows } = await withPool((pool) =>
      pool.query<{ cadence: string }>("select cadence from contacts where id = $1", [contactId]),
    );
    expect(rows[0].cadence).toBe("week");
    expect(visibleText(await getPage(`/contacts/${contactId}`))).toContain("Раз в неделю");
  });

  it("a contact created 20 days ago is 13 days overdue and shown in the block", async () => {
    expect(contactId).toBeDefined();
    await withPool((pool) =>
      pool.query("update contacts set created_at = now() - interval '20 days' where id = $1", [contactId]),
    );

    const html = await getPage("/");
    expect(html).toContain(`aria-label="Связались: ${contactName}"`);
    const row = blockRow(html, contactId!);
    expect(row).toContain("просрочено на 13 дней");
    expect(row).toContain("раз в неделю");

    expect(visibleText(await getPage(`/contacts/${contactId}`))).toContain("просрочено на 13 дней");
  });

  it("«Связались» in the block without JavaScript: the contact leaves the block, the note appears", async () => {
    expect(contactId).toBeDefined();
    const response = await submitForm("/", {}, `name="contactId" value="${contactId}"`);
    expect(response.status, "the block form stays on the home page").toBe(200);

    expect(await getPage("/")).not.toContain(`aria-label="Связались: ${contactName}"`);
    expect(await noteBodies(contactId!)).toEqual(["Связались"]);

    const card = await getPage(`/contacts/${contactId}`);
    expect(visibleText(card.split('data-testid="notes"')[1] ?? "")).toContain("Связались");
    expect(visibleText(card)).toContain("Следующий раз — до");
  });

  it("«Связались» in the card redirects back to the card", async () => {
    expect(contactId).toBeDefined();
    const response = await submitForm(`/contacts/${contactId}`, {}, 'name="returnTo"');
    expect(response.headers.get("location") ?? "", `got ${response.status}`).toMatch(
      new RegExp(`/contacts/${contactId}$`),
    );
    expect(await noteBodies(contactId!)).toEqual(["Связались", "Связались"]);
  });

  it("changes the frequency in the card without JavaScript", async () => {
    expect(contactId).toBeDefined();
    const response = await submitForm(`/contacts/${contactId}`, { cadence: "month", contactOn: "" }, 'name="cadence"');
    expect(response.status, "frequency form").toBe(200);

    const card = await getPage(`/contacts/${contactId}`);
    expect(card).toMatch(/<option value="month"[^>]*selected/);
    const { rows } = await withPool((pool) =>
      pool.query<{ cadence: string }>("select cadence from contacts where id = $1", [contactId]),
    );
    expect(rows[0].cadence).toBe("month");
  });

  it("a specific date in the past is refused, nothing is saved", async () => {
    expect(contactId).toBeDefined();
    const response = await submitForm(
      `/contacts/${contactId}`,
      { cadence: "date", contactOn: "2020-01-01" },
      'name="cadence"',
    );
    expect(visibleText(await response.text())).toContain("Дата уже прошла");

    const { rows } = await withPool((pool) =>
      pool.query<{ cadence: string; contact_on: string | null }>(
        "select cadence, contact_on from contacts where id = $1",
        [contactId],
      ),
    );
    expect(rows[0]).toMatchObject({ cadence: "month", contact_on: null });
  });

  describe("block and dots with many overdue contacts", () => {
    it("without JavaScript the page holds every row; only JavaScript trims it to 5", async () => {
      await withPool((pool) =>
        pool.query(
          "insert into contacts (name, cadence, created_at) select $1 || ' ' || n, 'week', now() - interval '30 days' from generate_series(1, $2::int) n",
          [prefix, BULK_COUNT],
        ),
      );

      const html = await getPage("/");
      const rows = countOf(html, 'aria-label="Связались: ');
      expect(rows).toBeGreaterThanOrEqual(BULK_COUNT);
      for (let n = 1; n <= BULK_COUNT; n += 1) {
        expect(html, `row ${n}`).toContain(`aria-label="Связались: ${prefix} ${n}"`);
      }

      // Rows past the first 5 are marked for hiding, but the CSS hides them only with JavaScript
      expect(countOf(html, "data-row-out")).toBe(rows - 5);
      expect(html).toContain("Показать все (");
      expect(html.match(/<html[^>]*>/)?.[0]).not.toContain("data-js");
    });

    it("the list in search shows a dot for each overdue contact and none for the others", async () => {
      const html = await getPage(`/?q=${marker}`);
      expect(html).toContain(`Найдено: ${BULK_COUNT + 1}`);
      // Counted in real HTML attributes and tags: the page also carries a serialized copy of the
      // markup for React (self.__next_f), where the same strings appear again
      expect(html.match(/class="[^"]*animate-due-overdue/g)?.length).toBe(BULK_COUNT);
      expect(countOf(html, '<span class="sr-only">, пора связаться</span>')).toBe(BULK_COUNT);
    });

    it("the block is not shown in search or on the second page", async () => {
      expect(await getPage(`/?q=${marker}`)).not.toContain('id="reminders-title"');
      expect(await getPage("/?page=2")).not.toContain('id="reminders-title"');
      expect(await getPage("/")).toContain('id="reminders-title"');
    });
  });
});
