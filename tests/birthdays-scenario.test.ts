import { Pool } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db";
import { addPeriod, parseDate, toDateString } from "@/lib/keep-in-touch";
import { contactSchema } from "@/lib/validation";
import {
  congratulate,
  createContact,
  getContact,
  getContactWithNotes,
  listBirthdays,
  listReminders,
  updateContact,
} from "@/server/contacts";
import { createGroup } from "@/server/groups";
import { type TestUser, createTestUser } from "./helpers/test-user";

// Scenarios of the contact-birthdays spec against the real database from .env. Every test gets its
// own user, so the block holds exactly the contacts the test made; the user and all their data are
// removed after each test.

let user: TestUser;

beforeEach(async () => {
  user = await createTestUser();
});

afterEach(async () => {
  await user.remove();
});

// For what the app cannot do by itself: a creation date in the past, a congratulation a year ago
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

afterAll(async () => {
  await pool.end();
  await closeDb();
});

type BirthdayForm = {
  birthDay?: string;
  birthMonth?: string;
  birthYear?: string;
  birthLeapDay?: string;
};

const form = (name: string, birthday: BirthdayForm = {}, extra: { groupIds?: string[] } = {}) =>
  contactSchema.parse({
    name,
    about: "",
    howWeMet: "",
    phone: "+7 (000) 555-55-55",
    email: "",
    ...birthday,
    ...extra,
  });

async function contact(name: string, birthday?: BirthdayForm, extra?: { groupIds?: string[] }) {
  return createContact(user.id, form(name, birthday, extra));
}

// The birthday that falls `offset` days from today (today as the app counts it); no year
function inDays(offset: number): BirthdayForm {
  const { month, day } = parseDate(toDateString(new Date(Date.now() + offset * 86_400_000)));
  return { birthDay: String(day), birthMonth: String(month) };
}

const birthdayOf = async (id: string) => {
  const saved = await getContact(user.id, id);
  return {
    birthDay: saved?.birthDay,
    birthMonth: saved?.birthMonth,
    birthYear: saved?.birthYear,
    birthLeapDay: saved?.birthLeapDay,
  };
};

describe("saving the birthday (requirement «Дата рождения в контакте»)", () => {
  it("scenario «Дата с годом»: 25 November 1990", async () => {
    const id = await contact("Анна", { birthDay: "25", birthMonth: "11", birthYear: "1990" });
    expect(await birthdayOf(id)).toEqual({
      birthDay: 25,
      birthMonth: 11,
      birthYear: 1990,
      birthLeapDay: null,
    });
  });

  it("scenario «Дата без года»: 3 March", async () => {
    const id = await contact("Анна", { birthDay: "3", birthMonth: "3" });
    expect(await birthdayOf(id)).toEqual({
      birthDay: 3,
      birthMonth: 3,
      birthYear: null,
      birthLeapDay: null,
    });
  });

  it("scenario «Удаление даты»: the cleared field removes the birthday, other data stays", async () => {
    const id = await contact("Анна", { birthDay: "3", birthMonth: "3" });
    expect(await updateContact(user.id, id, form("Анна", { birthDay: "", birthMonth: "" }))).toBe(
      id,
    );
    const saved = await getContact(user.id, id);
    expect(saved).toMatchObject({
      name: "Анна",
      phone: "+7 (000) 555-55-55",
      birthDay: null,
      birthMonth: null,
      birthYear: null,
      birthLeapDay: null,
    });
  });

  it("scenario «Смена даты с 29 февраля»: 29 February with 1 March changed to 3 March - no choice", async () => {
    const id = await contact("Анна", { birthDay: "29", birthMonth: "2", birthLeapDay: "mar_1" });
    expect((await birthdayOf(id)).birthLeapDay).toBe("mar_1");
    await updateContact(
      user.id,
      id,
      form("Анна", { birthDay: "3", birthMonth: "3", birthLeapDay: "mar_1" }),
    );
    expect(await birthdayOf(id)).toEqual({
      birthDay: 3,
      birthMonth: 3,
      birthYear: null,
      birthLeapDay: null,
    });
  });
});

describe("listBirthdays (requirement «Блок „Скоро день рождения“»)", () => {
  const names = (items: { name: string }[]) => items.map((item) => item.name);

  it("scenario «Опоздавшие сверху, дальше ближайшие»; contacts without a birthday are left out", async () => {
    await contact("Анна", inDays(5));
    await contact("Борис", inDays(0));
    await contact("Вера", inDays(1));
    await contact("Глеб", inDays(-1));
    await contact("Без даты");
    const items = await listBirthdays(user.id);
    expect(names(items)).toEqual(["Глеб", "Борис", "Вера", "Анна"]);
    expect(items.map((item) => item.days)).toEqual([-1, 0, 1, 5]);
  });

  it("gives the birthday fields the row needs", async () => {
    const tomorrow = inDays(1);
    // 1992 is a leap year: the test holds when tomorrow is 29 February
    const id = await contact("Анна", { ...tomorrow, birthYear: "1992" });
    const [item] = await listBirthdays(user.id);
    expect(item).toEqual({
      id,
      name: "Анна",
      days: 1,
      birthday: {
        day: Number(tomorrow.birthDay),
        month: Number(tomorrow.birthMonth),
        year: 1992,
        leapDay: tomorrow.birthDay === "29" && tomorrow.birthMonth === "2" ? "feb_28" : null,
      },
    });
  });

  it("scenario «Граница окна»: 7 days in, 8 days and the day before yesterday out", async () => {
    await contact("Через 7", inDays(7));
    await contact("Через 8", inDays(8));
    await contact("Позавчера", inDays(-2));
    expect(names(await listBirthdays(user.id))).toEqual(["Через 7"]);
  });

  it("scenario «Блок в группе»: only contacts of the group", async () => {
    const tennis = await createGroup(user.id, "Теннис");
    if (!("id" in tennis)) throw new Error(tennis.error);
    await contact("Анна", inDays(1), { groupIds: [tennis.id] });
    await contact("Борис", inDays(1));
    expect(names(await listBirthdays(user.id, { groupId: tennis.id }))).toEqual(["Анна"]);
    expect(names(await listBirthdays(user.id))).toEqual(["Анна", "Борис"]);
  });

  it("ignores a malformed or missing group, like the list", async () => {
    await contact("Анна", inDays(1));
    expect(names(await listBirthdays(user.id, { groupId: "not-a-uuid" }))).toEqual(["Анна"]);
  });
});

describe("congratulate (requirement «Отметка «Поздравил(а)»»)", () => {
  const names = (items: { name: string }[]) => items.map((item) => item.name);
  const today = () => toDateString(new Date());

  // A contact with a cadence, created `createdDaysAgo` days ago, so it is overdue without waiting
  async function insertWithCadence(
    name: string,
    birthday: BirthdayForm,
    cadence: { cadence: "week" | "date"; contactOn?: string; createdDaysAgo: number },
  ) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into contacts (user_id, name, birth_day, birth_month, birth_leap_day, cadence, contact_on, created_at)
       values ($1, $2, $3, $4, $5, $6::contact_cadence, $7, now() - $8 * interval '1 day') returning id`,
      [
        user.id,
        name,
        Number(birthday.birthDay),
        Number(birthday.birthMonth),
        // 29 February needs the choice; the default one
        birthday.birthDay === "29" && birthday.birthMonth === "2" ? "feb_28" : null,
        cadence.cadence,
        cadence.contactOn ?? null,
        cadence.createdDaysAgo,
      ],
    );
    return rows[0].id;
  }

  it("scenario «Поздравил(а)»: the row leaves the block, the note «Поздравил(а)» is on top of the card", async () => {
    const anna = await contact("Анна", inDays(1));
    await contact("Борис", inDays(2));

    const note = await congratulate(user.id, anna);
    expect(note?.body).toBe("Поздравил(а)");
    expect(names(await listBirthdays(user.id))).toEqual(["Борис"]);
    const card = await getContactWithNotes(user.id, anna);
    expect(card?.notes.map((item) => item.body)).toEqual(["Поздравил(а)"]);
    expect(card?.contact.birthCongratulatedOn).toBe(today());
  });

  it("scenario «Поздравили вчерашнего»: yesterday's birthday leaves the block", async () => {
    const gleb = await contact("Глеб", inDays(-1));
    await congratulate(user.id, gleb);
    expect(await listBirthdays(user.id)).toEqual([]);
  });

  it("scenario «До следующего дня рождения»: congratulated a year ago, 7 days to the next one - back in the block", async () => {
    const anna = await contact("Анна", inDays(7));
    await pool.query(
      "update contacts set birth_congratulated_on = (now() at time zone 'Europe/Moscow')::date - 358 where id = $1",
      [anna],
    );
    expect(names(await listBirthdays(user.id))).toEqual(["Анна"]);
  });

  it("scenario «Считается как «Связались»»: the contact leaves «Пора связаться», the term counts from today", async () => {
    const anna = await insertWithCadence("Анна", inDays(1), {
      cadence: "week",
      createdDaysAgo: 30,
    });
    expect(names((await listReminders(user.id)).items)).toEqual(["Анна"]);

    await congratulate(user.id, anna);
    expect((await listReminders(user.id)).items).toEqual([]);
    const card = await getContactWithNotes(user.id, anna);
    expect(card?.keepInTouch.dueOn).toBe(addPeriod(today(), "week"));
    expect(card?.contact.cadence).toBe("week");
  });

  it("scenario «Конкретная дата связи»: the specific date in 3 days is cleared, like after «Связались»", async () => {
    const { rows } = await pool.query<{ on: string }>(
      "select to_char((now() at time zone 'Europe/Moscow')::date + 3, 'YYYY-MM-DD') as on",
    );
    const anna = await insertWithCadence("Анна", inDays(1), {
      cadence: "date",
      contactOn: rows[0].on,
      createdDaysAgo: 1,
    });

    await congratulate(user.id, anna);
    expect(await getContact(user.id, anna)).toMatchObject({ cadence: null, contactOn: null });
  });

  it("changes nothing for a missing or malformed contact id", async () => {
    expect(await congratulate(user.id, "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await congratulate(user.id, "not-a-uuid")).toBeNull();
  });
});
