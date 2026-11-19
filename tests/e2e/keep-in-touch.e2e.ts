import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addPeriod, formatDueDate, toDateString } from "../../src/lib/keep-in-touch";
import { signInClient, visibleText, withPool } from "./helpers";

// "Keep in touch" over HTTP against a running app, signed in as a user of this test, forms sent the way
// a browser without JavaScript does it. Run: `pnpm build && pnpm start`, then `pnpm test:e2e`.

const marker = randomUUID().slice(0, 8);
const prefix = `Проверка Связь ${marker}`;
const contactName = `${prefix} основной`;
const BULK_COUNT = 7;
// Must match PAGE_SIZE in src/server/contacts.ts
const pageSize = 50;
let contactId: string | undefined;
let user: Awaited<ReturnType<typeof signInClient>>;

function countOf(html: string, text: string) {
  return html.split(text).length - 1;
}

// The block row of one contact: from its link to the end of the <li>
function blockRow(html: string, id: string) {
  return visibleText(html.split(`href="/contacts/${id}"`)[1]?.split("</li>")[0] ?? "");
}

async function noteBodies(id: string) {
  const { rows } = await withPool((pool) =>
    pool.query<{ body: string }>(
      "select body from notes where contact_id = $1 order by created_at",
      [id],
    ),
  );
  return rows.map((row) => row.body);
}

// The card text for a term counted from a contact made today
function nextTimeText(cadence: "week" | "month") {
  const today = toDateString(new Date());
  return `Следующий раз — до ${formatDueDate(addPeriod(today, cadence), today)}`;
}

// Signing in sends an email: the first one of a run opens the SMTP connection
beforeAll(async () => {
  user = await signInClient("keep-in-touch");
}, 30_000);

afterAll(async () => {
  // The user goes with the contacts and groups; notes and memberships follow by cascade
  await user?.remove();
});

describe("keep in touch over HTTP", () => {
  it("creates a contact with the weekly frequency", async () => {
    const response = await user.submitForm("/contacts/new", {
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
    expect(visibleText(await user.getPage(`/contacts/${contactId}`))).toContain("Раз в неделю");
  });

  it("a contact created 20 days ago is 13 days overdue and shown in the block", async () => {
    expect(contactId).toBeDefined();
    await withPool((pool) =>
      pool.query("update contacts set created_at = now() - interval '20 days' where id = $1", [
        contactId,
      ]),
    );

    const html = await user.getPage("/");
    expect(html).toContain(`aria-label="Связались: ${contactName}"`);
    const row = blockRow(html, contactId!);
    expect(row).toContain("просрочено на 13 дней");
    expect(row).toContain("раз в неделю");

    const card = visibleText(await user.getPage(`/contacts/${contactId}`));
    expect(card).toContain("Пора связаться");
    expect(card).toContain("просрочено на 13 дней");
  });

  it("«Связались» in the block without JavaScript: the contact leaves the block, the note appears", async () => {
    expect(contactId).toBeDefined();
    const response = await user.submitForm("/", {}, `name="contactId" value="${contactId}"`);
    // A redirect (not the page in the POST answer), so refreshing the page cannot send the form again
    expect(response.headers.get("location") ?? "", `got ${response.status}`).toMatch(/\/$/);

    expect(await user.getPage("/")).not.toContain(`aria-label="Связались: ${contactName}"`);
    expect(await noteBodies(contactId!)).toEqual(["Связались"]);

    const card = await user.getPage(`/contacts/${contactId}`);
    expect(visibleText(card.split('data-testid="notes"')[1] ?? "")).toContain("Связались");
    expect(visibleText(card)).toContain(nextTimeText("week"));
  });

  it("«Связались» in the card redirects back to the card", async () => {
    expect(contactId).toBeDefined();
    const response = await user.submitForm(`/contacts/${contactId}`, {}, 'name="returnTo"');
    expect(response.headers.get("location") ?? "", `got ${response.status}`).toMatch(
      new RegExp(`/contacts/${contactId}$`),
    );
    expect(await noteBodies(contactId!)).toEqual(["Связались", "Связались"]);
  });

  it("changes the frequency in the card without JavaScript", async () => {
    expect(contactId).toBeDefined();
    const response = await user.submitForm(
      `/contacts/${contactId}`,
      { cadence: "month", contactOn: "" },
      'name="cadence"',
    );
    expect(response.status, "frequency form").toBe(200);

    const card = await user.getPage(`/contacts/${contactId}`);
    expect(card).toMatch(/<option value="month"[^>]*selected/);
    // The term is recounted from the last contact: today's «Связались» above
    expect(visibleText(card)).toContain(nextTimeText("month"));
    const { rows } = await withPool((pool) =>
      pool.query<{ cadence: string }>("select cadence from contacts where id = $1", [contactId]),
    );
    expect(rows[0].cadence).toBe("month");
  });

  it("a specific date in the past is refused, nothing is saved", async () => {
    expect(contactId).toBeDefined();
    const response = await user.submitForm(
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
          "insert into contacts (user_id, name, cadence, created_at) select $3, $1 || ' ' || n, 'week', now() - interval '30 days' from generate_series(1, $2::int) n",
          [prefix, BULK_COUNT, user.id],
        ),
      );

      const html = await user.getPage("/");
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
      const html = await user.getPage(`/?q=${marker}`);
      expect(html).toContain(`Найдено: ${BULK_COUNT + 1}`);
      // Counted in real HTML attributes and tags: the page also carries a serialized copy of the
      // markup for React (self.__next_f), where the same strings appear again
      expect(html.match(/class="[^"]*animate-due-overdue/g)?.length).toBe(BULK_COUNT);
      expect(countOf(html, '<span class="sr-only">, пора связаться</span>')).toBe(BULK_COUNT);
    });

    it("the block is not shown in search or on the second page", async () => {
      // A second page must exist: the user has fewer contacts than a page so far, and a missing page
      // is shown as page 1, which has the block. Without a cadence these contacts stay out of the block
      await withPool((pool) =>
        pool.query(
          "insert into contacts (user_id, name) select $3, $1 || ' страница ' || n from generate_series(1, $2::int) n",
          [prefix, pageSize, user.id],
        ),
      );

      expect(await user.getPage(`/?q=${marker}`)).not.toContain('id="reminders-title"');
      expect(await user.getPage("/?page=2")).not.toContain('id="reminders-title"');
      expect(await user.getPage("/")).toContain('id="reminders-title"');
    });
  });

  // Last: it adds one more contact with the marker, which the search count above does not expect
  it("a contact whose term is tomorrow is shown in the block as «До <date>», not as overdue", async () => {
    const { rows } = await withPool((pool) =>
      pool.query<{ id: string }>(
        "insert into contacts (user_id, name, cadence, created_at) values ($2, $1, 'week', now() - interval '6 days') returning id",
        [`${prefix} скоро`, user.id],
      ),
    );

    const row = blockRow(await user.getPage("/"), rows[0].id);
    expect(row).toMatch(/До \d+ \p{L}+/u);
    expect(row).toContain("раз в неделю");
    expect(row).not.toContain("просрочено");
  });

  it("the block is not shown in search within a group, on the main page or on the group page", async () => {
    const { rows } = await withPool((pool) =>
      pool.query<{ group_id: string }>(
        `with g as (insert into groups (user_id, name) values ($3, $1) returning id),
              c as (insert into contacts (user_id, name, cadence, created_at)
                    values ($3, $2, 'week', now() - interval '30 days') returning id)
         insert into contact_groups (contact_id, group_id)
         select c.id, g.id from c, g returning group_id`,
        [`${prefix} группа`, `${prefix} в группе`, user.id],
      ),
    );
    const groupId = rows[0].group_id;
    const q = encodeURIComponent("в группе");

    expect(await user.getPage(`/?group=${groupId}`)).toContain('id="reminders-title"');
    expect(await user.getPage(`/?group=${groupId}&q=${q}`)).not.toContain('id="reminders-title"');
    expect(await user.getPage(`/groups/${groupId}`)).toContain('id="reminders-title"');
    expect(await user.getPage(`/groups/${groupId}?q=${q}`)).not.toContain('id="reminders-title"');
  });
});
