import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SIGN_OUT_FORM,
  emailCount,
  emailsFor,
  formBody,
  loginLinks,
  mailpitTotal,
  openLoginLink,
  removeUser,
  requestLoginLink,
  signInAs,
  uniqueEmail,
  userIdOf,
} from "./auth";
import { baseUrl, getPage, submitForm, visibleText, withPool } from "./helpers";

// Sign-in scenarios of openspec/specs (user-auth, data-ownership) over HTTP against a running
// app with Mailpit. Every address is fictional and unique to this run; terms (link, session, limit) are
// shifted in the database only on this test's own rows. Run: `pnpm build && pnpm start`, then `pnpm test:e2e`.

const SENT = "Ссылка для входа отправлена на";
const EMAIL_ERROR = "Проверь адрес почты";
const TOO_OFTEN = "Слишком часто, попробуй через несколько минут";
const EXPIRED = "Ссылка устарела, запроси новую";
const SESSION_SECONDS = 30 * 24 * 60 * 60;

// Every address the tests touch; afterAll removes its user, data, sign-in rows and emails
const used = new Set<string>();
function newEmail(label: string) {
  const email = uniqueEmail(label);
  used.add(email);
  return email;
}

afterAll(async () => {
  for (const email of used) await removeUser(email);
});

// A request without following redirects, with or without a session
async function open(path: string, cookie?: string) {
  const response = await fetch(new URL(path, baseUrl), {
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });
  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    setCookies: response.headers.getSetCookie(),
    html: await response.text(),
  };
}

function signOut(cookie: string) {
  return submitForm("/", {}, { formIncludes: SIGN_OUT_FORM, cookie });
}

async function loginEmailRows(email: string) {
  const { rows } = await withPool((pool) =>
    pool.query<{ total: number }>(
      "select count(*)::int as total from login_emails where email = $1",
      [email],
    ),
  );
  return rows[0].total;
}

const verificationValue = (email: string) => JSON.stringify({ type: "magic-link", email });

// A sign-in link request straight to Better Auth, outside the form (and outside its own normalization)
function requestLinkDirectly(email: string) {
  return fetch(new URL("/api/auth/sign-in/magic-link", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", Origin: new URL(baseUrl).origin },
    body: JSON.stringify({ email, callbackURL: "/" }),
  });
}

// Signing in sends emails: the first one of a run opens the SMTP connection
const SLOW = { timeout: 30_000 };

describe("without signing in", () => {
  let owner: string;
  let ownerCookie: string;
  let contactId: string;
  const contactName = `Проверка Вход ${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    owner = newEmail("closed");
    ownerCookie = await signInAs(owner);
    const ownerId = await userIdOf(owner);
    const { rows } = await withPool((pool) =>
      pool.query<{ id: string }>(
        "insert into contacts (user_id, name) values ($1, $2) returning id",
        [ownerId, contactName],
      ),
    );
    contactId = rows[0].id;
  }, SLOW.timeout);

  it("«Открыл приложение без входа»: the main page leads to the sign-in page", async () => {
    const home = await open("/");
    expect(home.status).toBe(307);
    expect(home.location).toMatch(/\/login$/);

    const login = visibleText(await getPage("/login"));
    expect(login).toContain("Почта");
    expect(login).toContain("Получить ссылку");
  });

  it("«Прямая ссылка без входа»: a card and «Группы» lead to the sign-in page, no data", async () => {
    for (const path of [`/contacts/${contactId}`, "/groups"]) {
      const page = await open(path);
      expect(page.status, path).toBe(307);
      expect(page.location, path).toMatch(/\/login$/);
      expect(page.html, path).not.toContain(contactName);
    }
  });

  it("«Отправка формы без входа»: the contact is not created", async () => {
    // The form markup (with the server action id) is the same for everyone: taken from a signed-in page
    const name = `${contactName} без входа`;
    const body = formBody(await getPage("/contacts/new", { cookie: ownerCookie }), {
      name,
      about: "",
      howWeMet: "",
      phone: "",
      email: "",
    });
    expect(body).toBeDefined();

    const response = await fetch(new URL("/contacts/new", baseUrl), {
      method: "POST",
      body,
      redirect: "manual",
      headers: { Origin: new URL(baseUrl).origin },
    });
    expect(response.headers.get("location") ?? "").toMatch(/\/login$/);
    const { rows } = await withPool((pool) =>
      pool.query("select id from contacts where name = $1", [name]),
    );
    expect(rows).toEqual([]);
  });

  it("«Проверка здоровья без входа»: /health answers 200", async () => {
    expect((await open("/health")).status).toBe(200);
  });
});

describe("requesting a link", SLOW, () => {
  it("«Ссылка для новой почты»: the «sent» text, the email arrives, no user yet", async () => {
    const email = newEmail("new");
    const { html } = await requestLoginLink(email);
    expect(visibleText(html)).toContain(`${SENT} ${email}`);
    expect(await loginLinks(email)).toHaveLength(1);
    await expect(userIdOf(email)).rejects.toThrow();
  });

  it("«Ссылка для известной почты»: the same text, the email arrives", async () => {
    const email = newEmail("known");
    await signInAs(email);
    const { html } = await requestLoginLink(email);
    expect(visibleText(html)).toContain(`${SENT} ${email}`);
    expect(await emailsFor(email, 2)).toHaveLength(2);
  });

  it("«Первый вход создаёт пользователя»: the link leads into the app with the email in the header", async () => {
    const email = newEmail("first");
    await requestLoginLink(email);
    const [link] = await loginLinks(email);

    const { location, cookie } = await openLoginLink(link);
    expect(location).toMatch(/^(http:\/\/[^/]+)?\/$/);
    const home = await getPage("/", { cookie });
    expect(home).toContain(`title="${email}"`);
    expect(home).toContain(SIGN_OUT_FORM);

    const { rows } = await withPool((pool) =>
      pool.query<{ name: string }>("select name from users where email = $1", [email]),
    );
    expect(rows).toEqual([{ name: "" }]);
  });

  it("«Почта с пробелами и большими буквами»: the email goes to the user, the link signs in as them", async () => {
    const email = newEmail("anna");
    await signInAs(email);
    const userId = await userIdOf(email);
    const contactName = `Проверка Регистр ${randomUUID().slice(0, 8)}`;
    await withPool((pool) =>
      pool.query("insert into contacts (user_id, name) values ($1, $2)", [userId, contactName]),
    );

    const typed = ` ${email[0].toUpperCase()}${email.slice(1).replace("example.test", "Example.TEST")} `;
    const { html } = await requestLoginLink(typed);
    expect(visibleText(html)).toContain(`${SENT} ${email}`);
    const [link] = await loginLinks(email, 2);

    const { cookie } = await openLoginLink(link);
    expect(await getPage("/", { cookie })).toContain(contactName);
    const { rows } = await withPool((pool) =>
      pool.query<{ total: number }>(
        "select count(*)::int as total from users where lower(email) = $1",
        [email],
      ),
    );
    expect(rows[0].total).toBe(1);
  });

  it("«Почта с пробелами и большими буквами» outside the form: the same user, the limit counts the normalized address", async () => {
    const email = newEmail("anna-direct");
    await signInAs(email);
    const emailsBefore = await loginEmailRows(email);

    // Better Auth itself lowers the case but refuses spaces: without our hook the first request would pass
    // and count toward another address, the second one would be refused
    for (const [n, typed] of [email.toUpperCase(), ` ${email.toUpperCase()} `].entries()) {
      expect((await requestLinkDirectly(typed)).status, typed).toBe(200);
      expect(await loginEmailRows(email), typed).toBe(emailsBefore + n + 1);
    }
    const [link] = await loginLinks(email, emailsBefore + 2);

    const { cookie } = await openLoginLink(link);
    expect(await getPage("/", { cookie })).toContain(`title="${email}"`);
    const { rows } = await withPool((pool) =>
      pool.query<{ total: number }>(
        "select count(*)::int as total from users where lower(trim(email)) = $1",
        [email],
      ),
    );
    expect(rows[0].total).toBe(1);
  });
});

describe("checking the address", () => {
  it("«Неверный адрес в форме»: the error under the field, the text stays, no email", async () => {
    const typed = `anna-${randomUUID().slice(0, 8)}@`;
    const before = await mailpitTotal();
    const { html } = await requestLoginLink(typed);
    expect(visibleText(html)).toContain(EMAIL_ERROR);
    expect(html).toContain(`value="${typed}"`);
    expect(await loginEmailRows(typed)).toBe(0);
    expect(await mailpitTotal()).toBe(before);
  });

  it("«Пустая почта»: the error under the field, no email", async () => {
    const before = await mailpitTotal();
    const { html } = await requestLoginLink("");
    expect(visibleText(html)).toContain(EMAIL_ERROR);
    expect(await mailpitTotal()).toBe(before);
  });

  it("«Неверный адрес в запросе мимо формы»: refused, no email", async () => {
    const before = await mailpitTotal();
    const response = await requestLinkDirectly("not-an-email");
    expect(response.status).toBe(400);
    expect(await loginEmailRows("not-an-email")).toBe(0);
    expect(await mailpitTotal()).toBe(before);
  });
});

describe("term and single use of a link", SLOW, () => {
  function expectRefused(opened: Awaited<ReturnType<typeof openLoginLink>>) {
    expect(opened.location).toMatch(/\/login\/expired(\?|$)/);
    expect(opened.cookie).not.toContain("session_token=");
  }

  it("«Ссылка открыта второй раз»: after signing out the same link leads to «Ссылка устарела»", async () => {
    const email = newEmail("twice");
    await requestLoginLink(email);
    const [link] = await loginLinks(email);
    const { cookie } = await openLoginLink(link);
    await signOut(cookie);

    expectRefused(await openLoginLink(link));
    const expired = await getPage("/login/expired");
    expect(visibleText(expired)).toContain(EXPIRED);
    expect(expired).toContain('href="/login"');
  });

  it("«Ссылке больше 15 минут»: a link past its 15 minutes does not sign in", async () => {
    const email = newEmail("late");
    await requestLoginLink(email);
    const [link] = await loginLinks(email);

    const { rows } = await withPool((pool) =>
      pool.query<{ minutes: number }>(
        "select round(extract(epoch from expires_at - created_at) / 60)::int as minutes from verifications where value = $1",
        [verificationValue(email)],
      ),
    );
    expect(rows).toEqual([{ minutes: 15 }]);
    await withPool((pool) =>
      pool.query(
        "update verifications set expires_at = now() - interval '1 second' where value = $1",
        [verificationValue(email)],
      ),
    );

    expectRefused(await openLoginLink(link));
  });

  it("«Запросил новую ссылку»: the first link is dead, the second signs in", async () => {
    const email = newEmail("again");
    await requestLoginLink(email);
    await requestLoginLink(email);
    const [second, first] = await loginLinks(email, 2);

    expectRefused(await openLoginLink(first));
    const { cookie } = await openLoginLink(second);
    expect(await getPage("/", { cookie })).toContain(`title="${email}"`);
  });
});

describe("limit of emails", SLOW, () => {
  async function requestThreeTimes(email: string) {
    for (let n = 0; n < 3; n += 1) {
      expect(visibleText((await requestLoginLink(email)).html)).toContain(`${SENT} ${email}`);
    }
    await emailsFor(email, 3);
  }

  it("«Четвёртый запрос за 10 минут»: «Слишком часто», no fourth email", async () => {
    const email = newEmail("limit");
    await requestThreeTimes(email);

    expect(visibleText((await requestLoginLink(email)).html)).toContain(TOO_OFTEN);
    expect(await emailCount(email)).toBe(3);
  });

  it("«Четвёртый запрос за 10 минут» with 12 requests at once: still 3 emails, the rest «Слишком часто»", async () => {
    const email = newEmail("limit-race");

    const answers = await Promise.all(
      Array.from({ length: 12 }, async () => visibleText((await requestLoginLink(email)).html)),
    );

    expect(answers.filter((text) => text.includes(`${SENT} ${email}`))).toHaveLength(3);
    expect(answers.filter((text) => text.includes(TOO_OFTEN))).toHaveLength(9);
    // Every answer is in, so every email that was going to be sent has been sent
    expect(await emailCount(email)).toBe(3);
    expect(await loginEmailRows(email)).toBe(3);
  });

  it("«Лимит после пробелов и регистра»: the limit counts the normalized address", async () => {
    const email = newEmail("limit-case");
    await requestThreeTimes(email);

    expect(visibleText((await requestLoginLink(`${email.toUpperCase()} `)).html)).toContain(
      TOO_OFTEN,
    );
    expect(await emailCount(email)).toBe(3);
  });

  it("«Лимит одной почты не мешает другой»: another address gets its email", async () => {
    const anna = newEmail("limit-anna");
    const boris = newEmail("limit-boris");
    await requestThreeTimes(anna);
    expect(visibleText((await requestLoginLink(anna)).html)).toContain(TOO_OFTEN);

    expect(visibleText((await requestLoginLink(boris)).html)).toContain(`${SENT} ${boris}`);
    expect(await loginLinks(boris)).toHaveLength(1);
  });

  it("«После 10 минут снова можно»: once the first of three is older than 10 minutes", async () => {
    const email = newEmail("limit-later");
    await requestThreeTimes(email);
    await withPool((pool) =>
      pool.query(
        `update login_emails set sent_at = now() - interval '11 minutes'
         where id = (select id from login_emails where email = $1 order by sent_at limit 1)`,
        [email],
      ),
    );

    expect(visibleText((await requestLoginLink(email)).html)).toContain(`${SENT} ${email}`);
    expect(await emailsFor(email, 4)).toHaveLength(4);
  });
});

describe("the email", SLOW, () => {
  it("«Содержимое письма»: sender, subject, «Войти» with the link, 15 minutes, the phrase", async () => {
    const email = newEmail("content");
    await requestLoginLink(email);
    const [message] = await emailsFor(email);
    const [link] = await loginLinks(email);
    const { pathname, search } = new URL(link);

    expect(message.From.Name).toBe("Свои люди - Личная CRM");
    expect(message.Subject).toBe("Ссылка для входа в «Свои люди»");
    expect(message.HTML).toMatch(
      /<a href="[^"]+\/api\/auth\/magic-link\/verify\?[^"]+"[^>]*>Войти<\/a>/,
    );
    expect(message.Text).toContain(pathname + search);
    for (const text of [message.Text, message.HTML]) {
      expect(text).toContain("15 минут");
      expect(text).toContain("Если вход запрашивал(а) не ты - просто проигнорируй письмо");
    }
  });

  it("«Письмо локально»: the email is in Mailpit, its link signs in", async () => {
    const email = newEmail("local");
    await requestLoginLink(email);
    const [link] = await loginLinks(email);
    const { cookie } = await openLoginLink(link);
    expect(await getPage("/", { cookie })).toContain(`title="${email}"`);
  });
});

describe("session", SLOW, () => {
  async function shiftSession(email: string, days: number) {
    await withPool((pool) =>
      pool.query(
        `update sessions set expires_at = expires_at - make_interval(days => $2),
                             updated_at = updated_at - make_interval(days => $2)
         where user_id = (select id from users where email = $1)`,
        [email, days],
      ),
    );
  }

  it("«Заход продлевает вход»: a visit on day 20 extends the term, on day 40 still inside", async () => {
    const email = newEmail("extend");
    const cookie = await signInAs(email);

    await shiftSession(email, 20);
    const day20 = await open("/", cookie);
    expect(day20.status).toBe(200);
    const { rows } = await withPool((pool) =>
      pool.query<{ days: number }>(
        `select round(extract(epoch from expires_at - now()) / 86400)::int as days from sessions
         where user_id = (select id from users where email = $1)`,
        [email],
      ),
    );
    expect(rows).toEqual([{ days: 30 }]);
    // The browser keeps the cookie only as long as its Max-Age: the visit must renew it too
    const renewed = day20.setCookies.find((header) => /session_token=[^;]+;/.test(header));
    expect(renewed, "Set-Cookie of the session on the day-20 visit").toContain(
      `Max-Age=${SESSION_SECONDS}`,
    );

    await shiftSession(email, 20);
    expect((await open("/", cookie)).status).toBe(200);
  });

  it("«30 дней без захода»: the sign-in page", async () => {
    const email = newEmail("idle");
    const cookie = await signInAs(email);
    await shiftSession(email, 31);

    const home = await open("/", cookie);
    expect(home.status).toBe(307);
    expect(home.location).toMatch(/\/login$/);
  });

  it("«Два устройства»: both are inside at the same time", async () => {
    const email = newEmail("two");
    const phone = await signInAs(email);
    const laptop = await signInAs(email);

    expect(phone).not.toBe(laptop);
    for (const cookie of [phone, laptop]) {
      expect(await getPage("/", { cookie })).toContain(`title="${email}"`);
    }
  });
});

describe("header and signing out", SLOW, () => {
  it("«Почта в шапке»: the email and «Выйти»", async () => {
    const email = newEmail("header");
    const html = await getPage("/", { cookie: await signInAs(email) });
    const header = html.split("<header")[1]?.split("</header>")[0] ?? "";
    expect(visibleText(header)).toContain(email);
    expect(header).toContain(SIGN_OUT_FORM);
  });

  it("«Выход»: the sign-in page opens, the main page needs a new sign-in", async () => {
    const email = newEmail("out");
    const cookie = await signInAs(email);

    const response = await signOut(cookie);
    expect(response.headers.get("location") ?? "").toMatch(/\/login$/);
    const home = await open("/", cookie);
    expect(home.status).toBe(307);
    expect(home.location).toMatch(/\/login$/);
  });

  it("«Выход на одном устройстве»: the other device stays inside", async () => {
    const email = newEmail("out-one");
    const phone = await signInAs(email);
    const laptop = await signInAs(email);

    await signOut(phone);
    expect((await open("/", phone)).status).toBe(307);
    expect(await getPage("/", { cookie: laptop })).toContain(`title="${email}"`);
  });
});

describe("records of another user, a new user", SLOW, () => {
  let annaCookie: string;
  let borisCookie: string;
  let contactId: string;
  let groupId: string;
  const marker = randomUUID().slice(0, 8);
  const contactName = `Проверка Чужой ${marker}`;
  const groupName = `Проверка Чужая ${marker}`;

  beforeAll(async () => {
    const anna = newEmail("owner-anna");
    annaCookie = await signInAs(anna);
    borisCookie = await signInAs(newEmail("owner-boris"));
    const annaId = await userIdOf(anna);
    const { rows } = await withPool((pool) =>
      pool.query<{ contact_id: string; group_id: string }>(
        `with c as (insert into contacts (user_id, name) values ($1, $2) returning id),
              g as (insert into groups (user_id, name) values ($1, $3) returning id)
         select c.id as contact_id, g.id as group_id from c, g`,
        [annaId, contactName, groupName],
      ),
    );
    ({ contact_id: contactId, group_id: groupId } = rows[0]);
  }, SLOW.timeout);

  // The texts of not-found.tsx. They are looked for in the whole answer: `next dev` sends the 404 screen only
  // in the React payload and draws it in the browser, a production build sends it as HTML. How the screen
  // looks is checked in the browser (tests/browser/login.spec.ts)
  function expectNotFoundScreen(page: Awaited<ReturnType<typeof open>>) {
    expect(page.status).toBe(404);
    expect(page.html).toContain("Не нашлось");
    expect(page.html).toContain("Такого контакта или страницы нет.");
  }

  it("«Чужой контакт по ссылке»: the same screen as for a contact that does not exist", async () => {
    expect((await open(`/contacts/${contactId}`, annaCookie)).html).toContain(contactName);

    const foreign = await open(`/contacts/${contactId}`, borisCookie);
    expectNotFoundScreen(foreign);
    expectNotFoundScreen(await open(`/contacts/${randomUUID()}`, borisCookie));
    expect(foreign.html).not.toContain(contactName);
  });

  it("«Чужая группа по ссылке»: the same screen as for a group that does not exist", async () => {
    expect((await open(`/groups/${groupId}`, annaCookie)).html).toContain(groupName);

    const foreign = await open(`/groups/${groupId}`, borisCookie);
    expectNotFoundScreen(foreign);
    expectNotFoundScreen(await open(`/groups/${randomUUID()}`, borisCookie));
    expect(foreign.html).not.toContain(groupName);
  });

  it("«Первый вход»: an empty list with «Добавь первый контакт», no groups, no blocks", async () => {
    const cookie = await signInAs(newEmail("fresh"));

    const home = await getPage("/", { cookie });
    expect(visibleText(home)).toContain("Всего: 0");
    expect(visibleText(home)).toContain("Добавь первый контакт");
    expect(home).not.toContain('id="reminders-title"');
    expect(home).not.toContain('id="birthdays-title"');
    expect(home).not.toContain(contactName);

    const groups = await getPage("/groups", { cookie });
    expect(visibleText(groups)).toContain("Групп пока нет");
    expect(groups).not.toContain(groupName);
  });
});
