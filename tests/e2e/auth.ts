import { randomUUID } from "node:crypto";
import { Pool } from "pg";

// Sign-in for the e2e tests against a running app: the link is requested through the /login form, the email
// is read from Mailpit (locally `docker compose up -d mailpit`, in CI a service), the link is opened and the
// session cookie kept. No test framework here: the Vitest HTTP tests and the Playwright browser tests share it.
// Addresses are fictional and unique (`<label>-<marker>@example.test`); `removeUser` deletes the user with
// everything they own, their sign-in rows and their emails.

export const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const mailpitUrl = process.env.MAILPIT_URL ?? "http://localhost:8025";

export async function withPool<T>(run: (pool: Pool) => Promise<T>) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

const htmlEntities: Record<string, string> = {
  "&quot;": '"',
  "&amp;": "&",
  "&#x27;": "'",
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

export function decodeHtml(value: string) {
  return value.replace(/&(?:quot|amp|#x27|#39|lt|gt);/g, (entity) => htmlEntities[entity]);
}

// The body a browser without JavaScript sends for a POST form of the page: its hidden inputs (including the
// server action id) plus `fields`. A page may hold several forms: `formIncludes` picks the one whose markup
// contains that text (e.g. `name="contactId" value="…"`), by default the first form of the page itself,
// not «Выйти» in the header (pick that one with `formIncludes: SIGN_OUT_FORM`). No such form: undefined
export const SIGN_OUT_FORM = 'aria-label="Выйти"';

export function formBody(html: string, fields: Record<string, string>, formIncludes?: string) {
  const forms = [...html.matchAll(/<form[^>]*method="POST"[^>]*>([\s\S]*?)<\/form>/g)];
  const form = formIncludes
    ? forms.find((candidate) => candidate[1].includes(formIncludes))
    : forms.find((candidate) => !candidate[1].includes(SIGN_OUT_FORM));
  if (!form) return undefined;

  const body = new FormData();
  for (const [, key, value = ""] of form[1].matchAll(
    /<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/?>/g,
  )) {
    body.append(key, decodeHtml(value));
  }
  for (const [key, value] of Object.entries(fields)) {
    body.append(key, value);
  }
  return body;
}

export function uniqueEmail(label: string) {
  return `${label}-${randomUUID().slice(0, 8)}@example.test`;
}

type MailpitSummary = { ID: string; Created: string; To: { Address: string }[] };

// Emails Mailpit holds for exactly this address, newest first
async function emailsTo(email: string) {
  const response = await fetch(
    `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
  );
  if (!response.ok) {
    throw new Error(`Mailpit search answered ${response.status}`);
  }
  const { messages = [] } = (await response.json()) as { messages?: MailpitSummary[] };
  const address = email.toLowerCase();
  return messages
    .filter((message) => message.To.some((to) => to.Address.toLowerCase() === address))
    .sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created));
}

export async function emailCount(email: string) {
  return (await emailsTo(email)).length;
}

// The link of a sign-in email, pointed at the app under test (the email carries BETTER_AUTH_URL)
function linkIn(text: string) {
  const link = text.match(/https?:\/\/\S+\/api\/auth\/magic-link\/verify\?\S+/)?.[0];
  if (!link) {
    throw new Error("No sign-in link in the email");
  }
  const { pathname, search } = new URL(link);
  return new URL(pathname + search, baseUrl).toString();
}

export type Email = {
  From: { Name: string; Address: string };
  To: { Address: string }[];
  Subject: string;
  Text: string;
  HTML: string;
};

// The emails sent to the address, newest first, once Mailpit holds at least `count` of them
export async function emailsFor(email: string, count = 1) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const messages = await emailsTo(email);
    if (messages.length >= count) {
      return Promise.all(
        messages.map(
          async ({ ID }) =>
            (await (await fetch(`${mailpitUrl}/api/v1/message/${ID}`)).json()) as Email,
        ),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Mailpit has fewer than ${count} emails for the address`);
}

// The sign-in links sent to the address, newest first, once Mailpit holds at least `count` emails for it
export async function loginLinks(email: string, count = 1) {
  return (await emailsFor(email, count)).map((message) => linkIn(message.Text));
}

// How many emails Mailpit holds for anyone: a check that nothing was sent at all
export async function mailpitTotal() {
  const response = await fetch(`${mailpitUrl}/api/v1/messages?limit=1`);
  return ((await response.json()) as { total: number }).total;
}

async function deleteEmailsTo(email: string) {
  const IDs = (await emailsTo(email)).map((message) => message.ID);
  if (IDs.length === 0) return;
  await fetch(`${mailpitUrl}/api/v1/messages`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ IDs }),
  });
}

// «Получить ссылку» on /login, sent the way a browser without JavaScript does it. The answer is the page with
// the form state: «Ссылка для входа отправлена на …» or an error under the field
export async function requestLoginLink(email: string) {
  const page = await fetch(new URL("/login", baseUrl), { redirect: "manual" });
  const body = formBody(await page.text(), { email }, 'name="email"');
  if (!body) {
    throw new Error(`No sign-in form on /login (answer ${page.status})`);
  }
  const response = await fetch(new URL("/login", baseUrl), {
    method: "POST",
    body,
    redirect: "manual",
    headers: { Origin: new URL(baseUrl).origin },
    // The first email of a run opens the SMTP connection, which can take seconds
    signal: AbortSignal.timeout(15_000),
  });
  return { status: response.status, html: await response.text() };
}

// Opens a sign-in link like a click in the email. A working link redirects into the app and sets the session
// cookie; a used, expired or replaced one redirects to /login/expired without a cookie
export async function openLoginLink(link: string) {
  const response = await fetch(link, { redirect: "manual" });
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    // a cookie set to an empty value is a deletion
    .filter((pair) => !pair.endsWith("="))
    .join("; ");
  return { status: response.status, location: response.headers.get("location") ?? "", cookie };
}

export async function userIdOf(email: string) {
  const { rows } = await withPool((pool) =>
    pool.query<{ id: string }>("select id from users where email = $1", [email]),
  );
  if (!rows[0]) {
    throw new Error("No user with this email");
  }
  return rows[0].id;
}

export type SignedInUser = {
  id: string;
  email: string;
  // The Cookie header of the signed-in session
  cookie: string;
  remove: () => Promise<void>;
};

// Signs in as this (normalized) address over HTTP, a new user or a known one: the link from the form, the
// email from Mailpit, the link opened. Returns the Cookie header of the new session
export async function signInAs(email: string) {
  const sentBefore = await emailCount(email);
  const { status, html } = await requestLoginLink(email);
  if (!html.includes(`Ссылка для входа отправлена на ${email}`)) {
    throw new Error(`Requesting the sign-in link answered ${status} without the «sent» text`);
  }
  const [link] = await loginLinks(email, sentBefore + 1);
  const { location, cookie } = await openLoginLink(link);
  if (!cookie.includes("session_token=")) {
    throw new Error(`The sign-in link set no session cookie (redirect to "${location}")`);
  }
  return cookie;
}

// A new user signed in over HTTP
export async function signIn(label = "user"): Promise<SignedInUser> {
  const email = uniqueEmail(label);
  const remove = () => removeUser(email);
  try {
    const cookie = await signInAs(email);
    return { id: await userIdOf(email), email, cookie, remove };
  } catch (error) {
    await remove();
    throw error;
  }
}

// Deletes the user of this address with everything they own, their sign-in rows and their emails.
// Safe to call more than once and when the user was never created
export async function removeUser(email: string) {
  await withPool(async (pool) => {
    // contacts and groups reference the user with RESTRICT, so they go first: notes and memberships
    // follow by cascade, sessions and accounts go with the user
    const owner = "user_id in (select id from users where email = $1)";
    await pool.query(`delete from contacts where ${owner}`, [email]);
    await pool.query(`delete from groups where ${owner}`, [email]);
    await pool.query("delete from users where email = $1", [email]);
    await pool.query("delete from login_emails where email = $1", [email]);
    await pool.query("delete from verifications where value = $1", [
      JSON.stringify({ type: "magic-link", email }),
    ]);
  });
  await deleteEmailsTo(email);
}
