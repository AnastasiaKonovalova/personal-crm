import { randomUUID } from "node:crypto";
import { fakerRU as faker } from "@faker-js/faker";
import { and, count, eq, isNotNull, sql } from "drizzle-orm";
import { daysBetween, formatDate, parseDate, toDateString } from "../lib/keep-in-touch";
import { closeDb, getDb } from "./index";
import { type contactCadence, contactGroups, contacts, groups, notes, users } from "./schema";

// Fills the database with fictional contacts and groups of the user with the email from OWNER_EMAIL
// (the user is created if there is none). Each part is skipped if that user already has rows of it.
// Ids are random, not from faker: the same demo data can be created for another owner email too.

const CONTACT_COUNT = 1000;
const BATCH_SIZE = 500;
const CADENCE_SHARE = 0.1;
const DAY_MS = 24 * 60 * 60 * 1000;

const ROLES = [
  "Дизайнер интерьеров",
  "Архитектор",
  "Сосед по дому",
  "Бывший коллега",
  "Преподаватель цигун",
  "Родитель одноклассника",
  "Фотограф",
  "Риелтор",
  "Педиатр",
  "Бухгалтер",
  "Разработчик",
  "Предприниматель",
  "Маркетолог",
  "Однокурсник",
  "Тренер по йоге",
  "Юрист",
  "Психолог",
  "Прораб",
  "Флорист",
  "Владелец кофейни",
  "Продакт-менеджер",
  "Аналитик данных",
  "Иллюстратор",
  "Журналист",
  "Организатор мероприятий",
];

const ORIGINS = [
  "Учились вместе в университете",
  "Познакомились на конференции",
  "Через общих друзей",
  "Соседи по дому",
  "Работали в одной команде",
  "Группа цигун по выходным",
  "Родительский чат детского сада",
  "Курсы английского",
  "Нетворкинг-завтрак",
  "Порекомендовали на ремонт квартиры",
  "Летний лагерь в детстве",
  "Коворкинг",
  "Онлайн-курс по дизайну",
  "Свадьба друзей",
  "Спортзал",
];

const TOPICS = [
  "ремонт квартиры",
  "детский сад",
  "цигун по выходным",
  "новую работу",
  "поездку в Грузию",
  "курсы английского",
  "дачу",
  "запуск своего дела",
  "книги по дизайну",
  "выставку в Манеже",
  "переезд",
  "совместный проект",
];

const WHEN = [
  "на следующей неделе",
  "после праздников",
  "в начале месяца",
  "через пару недель",
  "весной",
  "в пятницу",
];

const THINGS = [
  "презентацию",
  "контакты мастера",
  "список книг",
  "фото проекта",
  "расписание занятий",
  "резюме",
];

const EVENTS = [
  "конференции",
  "дне рождения общего друга",
  "родительском собрании",
  "открытии студии",
  "мастер-классе",
];

const NOTE_TEMPLATES = [
  "Поговорили про {topic}. Договорились созвониться {when}.",
  "Обсудили {topic}. Нужно отправить {thing}.",
  "Встретились на {event}, обменялись контактами. Обещали скинуть {thing}.",
  "Коротко переписались, всё в порядке. Вернуться к теме «{topic}» {when}.",
  "Созвонились по поводу {topic}. Следующий шаг — встреча {when}.",
  "Поздравить с днём рождения. Спросить про {topic}.",
];

const TRANSLIT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function transliterate(value: string) {
  return [...value.toLowerCase()]
    .map((char) => TRANSLIT[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]/g, "");
}

// Area code 000 does not exist, so these numbers cannot belong to real people
function fakePhone() {
  const digits = faker.string.numeric(7);
  return `+7 (000) ${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function fakeEmail(firstName: string, lastName: string) {
  const domain = faker.helpers.arrayElement(["example.com", "example.org", "example.net"]);
  const separator = faker.helpers.arrayElement([".", "_", ""]);
  return `${transliterate(firstName)}${separator}${transliterate(lastName)}${faker.helpers.maybe(() => faker.string.numeric(2), { probability: 0.3 }) ?? ""}@${domain}`;
}

type Cadence = (typeof contactCadence.enumValues)[number];
type Status = "overdue" | "soon" | "ok";

const PERIOD_DAYS: Record<Exclude<Cadence, "date">, number> = {
  week: 7,
  month: 30,
  quarter: 91,
  half_year: 182,
  year: 365,
};

// Days to the due date (negative = overdue). Ranges keep a 2-day margin from the status borders,
// because months are approximated here as fixed day counts; the app counts calendar months
function daysToDueRange(cadence: Exclude<Cadence, "date">, status: Status): [number, number] {
  if (status === "overdue") return [-40, -4];
  if (status === "soon") return cadence === "week" ? [0, 2] : [4, 5];
  return cadence === "week" ? [3, 6] : [10, PERIOD_DAYS[cadence] - 1];
}

const DATE_OFFSET_RANGE: Record<Status, [number, number]> = {
  overdue: [-30, -3],
  soon: [1, 5],
  ok: [15, 120],
};

// Gives about a tenth of contacts a cadence and picks dates so that every status shows up locally
function buildKeepInTouch() {
  if (!faker.helpers.maybe(() => true, { probability: CADENCE_SHARE })) return null;

  const cadence = faker.helpers.weightedArrayElement<Cadence>([
    { weight: 25, value: "week" },
    { weight: 30, value: "month" },
    { weight: 15, value: "quarter" },
    { weight: 8, value: "half_year" },
    { weight: 7, value: "year" },
    { weight: 15, value: "date" },
  ]);
  const status = faker.helpers.weightedArrayElement<Status>([
    { weight: 4, value: "overdue" },
    { weight: 2, value: "soon" },
    { weight: 4, value: "ok" },
  ]);

  if (cadence === "date") {
    const [min, max] = DATE_OFFSET_RANGE[status];
    const contactOn = new Date(Date.now() + faker.number.int({ min, max }) * DAY_MS);
    const lastContactAt = new Date(Date.now() - faker.number.int({ min: 1, max: 200 }) * DAY_MS);
    return { cadence, contactOn: contactOn.toISOString().slice(0, 10), lastContactAt };
  }

  const [min, max] = daysToDueRange(cadence, status);
  const daysSinceContact = PERIOD_DAYS[cadence] - faker.number.int({ min, max });
  return {
    cadence,
    contactOn: null,
    lastContactAt: new Date(Date.now() - daysSinceContact * DAY_MS),
  };
}

function buildContact() {
  const sex = faker.helpers.arrayElement(["female", "male"] as const);
  const firstName = faker.person.firstName(sex);
  const lastName = faker.person.lastName(sex);
  const keepInTouch = buildKeepInTouch();

  // A contact without notes is counted from creation, so its creation date is the last contact
  const hasNotes = faker.helpers.maybe(() => true, { probability: 0.7 }) ?? false;
  const createdAt = !keepInTouch
    ? faker.date.past({ years: 3 })
    : hasNotes
      ? new Date(
          keepInTouch.lastContactAt.getTime() - faker.number.int({ min: 1, max: 400 }) * DAY_MS,
        )
      : keepInTouch.lastContactAt;

  return {
    row: {
      id: randomUUID(),
      name: `${firstName} ${lastName}`,
      about:
        faker.helpers.maybe(() => faker.helpers.arrayElement(ROLES), { probability: 0.9 }) ?? null,
      howWeMet:
        faker.helpers.maybe(() => faker.helpers.arrayElement(ORIGINS), { probability: 0.85 }) ??
        null,
      phone: faker.helpers.maybe(fakePhone, { probability: 0.8 }) ?? null,
      email:
        faker.helpers.maybe(() => fakeEmail(firstName, lastName), { probability: 0.7 }) ?? null,
      cadence: keepInTouch?.cadence ?? null,
      contactOn: keepInTouch?.contactOn ?? null,
      createdAt,
    },
    // Set only for contacts with a cadence: the date of their latest note
    lastContactAt: keepInTouch && hasNotes ? keepInTouch.lastContactAt : null,
  };
}

function buildNoteBody() {
  return faker.helpers
    .arrayElement(NOTE_TEMPLATES)
    .replace("{topic}", faker.helpers.arrayElement(TOPICS))
    .replace("{when}", faker.helpers.arrayElement(WHEN))
    .replace("{thing}", faker.helpers.arrayElement(THINGS))
    .replace("{event}", faker.helpers.arrayElement(EVENTS));
}

function buildNotes(contact: ReturnType<typeof buildContact>) {
  const { id: contactId, createdAt: contactCreatedAt, cadence } = contact.row;

  if (cadence) {
    // The latest note sits exactly on lastContactAt, earlier ones are random
    const { lastContactAt } = contact;
    if (!lastContactAt) return [];
    const earlier = Array.from({ length: faker.number.int({ min: 0, max: 3 }) }, () => ({
      contactId,
      body: buildNoteBody(),
      createdAt: faker.date.between({ from: contactCreatedAt, to: lastContactAt }),
    }));
    return [...earlier, { contactId, body: buildNoteBody(), createdAt: lastContactAt }];
  }

  const noteCount = faker.helpers.weightedArrayElement([
    { weight: 30, value: 0 },
    { weight: 25, value: 1 },
    { weight: 20, value: 2 },
    { weight: 12, value: 3 },
    { weight: 8, value: 4 },
    { weight: 5, value: 5 },
  ]);
  return Array.from({ length: noteCount }, () => ({
    contactId,
    body: buildNoteBody(),
    createdAt: faker.date.between({ from: contactCreatedAt, to: new Date() }),
  }));
}

const GROUP_NAMES = [
  "Цигун по выходным",
  "Бывшие коллеги",
  "Соседи",
  "Однокурсники",
  "Родители из детского сада",
  "Ремонт квартиры",
  "Книжный клуб",
  // Exactly 50 characters: the longest allowed name
  "Знакомые с конференций по дизайну интерьеров, 2025",
];
const LONG_GROUP_NAME = GROUP_NAMES[GROUP_NAMES.length - 1];

// Group counts for the first contacts in list order, so the first page always shows
// rows with 0, 1, 2, 3 and 5 groups
const FIRST_PAGE_GROUP_COUNTS = [5, 0, 2, 1, 3, 0, 5, 2, 1, 0];

type Db = ReturnType<typeof getDb>;

function pickGroupCount() {
  return faker.helpers.weightedArrayElement([
    { weight: 40, value: 0 },
    { weight: 30, value: 1 },
    { weight: 15, value: 2 },
    { weight: 7, value: 3 },
    { weight: 4, value: 4 },
    { weight: 4, value: 5 },
  ]);
}

// Runs separately from contacts, so a database seeded before groups existed gets groups too
async function seedGroups(db: Db, ownerId: string) {
  const [{ total }] = await db
    .select({ total: count() })
    .from(groups)
    .where(eq(groups.userId, ownerId));
  if (total > 0) {
    console.log(`Groups skipped: the owner already has ${total} groups`);
    return;
  }

  faker.seed(20261112);
  const contactIds = (
    await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.userId, ownerId))
      .orderBy(sql`lower(${contacts.name})`, contacts.id)
  ).map((row) => row.id);

  const groupRows = GROUP_NAMES.map((name) => ({ id: randomUUID(), name }));
  const longGroupId = groupRows.find((group) => group.name === LONG_GROUP_NAME)!.id;
  const otherGroupIds = groupRows
    .filter((group) => group.id !== longGroupId)
    .map((group) => group.id);

  const memberships = contactIds.flatMap((contactId, index) => {
    const fixedCount = FIRST_PAGE_GROUP_COUNTS[index];
    const groupCount = fixedCount ?? pickGroupCount();
    // Rows with 5 groups on the first page include the long name
    const picked =
      fixedCount === 5
        ? [longGroupId, ...faker.helpers.arrayElements(otherGroupIds, 4)]
        : faker.helpers.arrayElements(
            groupRows.map((group) => group.id),
            groupCount,
          );
    return picked.map((groupId) => ({ contactId, groupId }));
  });

  await db.transaction(async (tx) => {
    await tx.insert(groups).values(groupRows.map((group) => ({ ...group, userId: ownerId })));
    for (let start = 0; start < memberships.length; start += BATCH_SIZE) {
      await tx.insert(contactGroups).values(memberships.slice(start, start + BATCH_SIZE));
    }
  });

  console.log(`Seeded ${groupRows.length} groups and ${memberships.length} memberships`);
}

const BIRTHDAY_SHARE = 0.3;
// Days from the seed day. Inside the «Скоро день рождения» window (yesterday … in 7 days): 12 rows,
// so the expanded block has two pages. Just outside it: 2 days ago and in 8 days
const WINDOW_OFFSETS = [-1, 0, 0, 1, 2, 3, 3, 4, 5, 6, 7, 7];
const OUTSIDE_OFFSETS = [-2, 8];

type LeapDay = "feb_28" | "mar_1";
type BirthdayRow = { day: number; month: number; year: number | null; leapDay: LeapDay | null };

// A third of the dates without the year
function birthYear() {
  return faker.helpers.maybe(() => faker.number.int({ min: 1955, max: 2005 }), {
    probability: 2 / 3,
  }) ?? null;
}

function shiftedBirthday(today: string, offset: number): BirthdayRow {
  const { year, month, day } = parseDate(today);
  const moved = new Date(Date.UTC(year, month - 1, day + offset));
  const [movedDay, movedMonth] = [moved.getUTCDate(), moved.getUTCMonth() + 1];
  return {
    day: movedDay,
    month: movedMonth,
    year: birthYear(),
    // The database wants the choice exactly for 29 February
    leapDay: movedDay === 29 && movedMonth === 2 ? "feb_28" : null,
  };
}

// A random date that stays out of the window and its two edges, so the block holds only the dates above.
// No 29 February: the two of them are set apart
function randomBirthday(today: string): BirthdayRow {
  const { year } = parseDate(today);
  for (;;) {
    const month = faker.number.int({ min: 1, max: 12 });
    // 2001 is a common year: its February has 28 days
    const day = faker.number.int({ min: 1, max: new Date(Date.UTC(2001, month, 0)).getUTCDate() });
    const nearWindow = [year - 1, year, year + 1].some((candidate) => {
      const days = daysBetween(today, formatDate(candidate, month, day));
      return days >= OUTSIDE_OFFSETS[0] && days <= OUTSIDE_OFFSETS[1];
    });
    if (!nearWindow) return { day, month, year: birthYear(), leapDay: null };
  }
}

// Runs separately from contacts, so a database seeded before birthdays existed gets them too.
// Dates around the window are counted from the seed day (design.md п.7 of the change `birthdays`)
async function seedBirthdays(db: Db, ownerId: string) {
  const [{ total }] = await db
    .select({ total: count() })
    .from(contacts)
    .where(and(eq(contacts.userId, ownerId), isNotNull(contacts.birthMonth)));
  if (total > 0) {
    console.log(`Birthdays skipped: the owner already has ${total} birthdays`);
    return;
  }

  faker.seed(20261124);
  const contactIds = faker.helpers.shuffle(
    (
      await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.userId, ownerId))
        .orderBy(sql`lower(${contacts.name})`, contacts.id)
    ).map((row) => row.id),
  );

  const today = toDateString(new Date());
  const fixed: BirthdayRow[] = [
    ...[...WINDOW_OFFSETS, ...OUTSIDE_OFFSETS].map((offset) => shiftedBirthday(today, offset)),
    { day: 29, month: 2, year: 1992, leapDay: "feb_28" },
    { day: 29, month: 2, year: null, leapDay: "mar_1" },
  ];
  const randomCount = Math.max(0, Math.round(contactIds.length * BIRTHDAY_SHARE) - fixed.length);
  const birthdays = [
    ...fixed,
    ...Array.from({ length: randomCount }, () => randomBirthday(today)),
  ].slice(0, contactIds.length);

  await db.transaction(async (tx) => {
    for (const [index, birthday] of birthdays.entries()) {
      await tx
        .update(contacts)
        .set({
          birthDay: birthday.day,
          birthMonth: birthday.month,
          birthYear: birthday.year,
          birthLeapDay: birthday.leapDay,
        })
        .where(eq(contacts.id, contactIds[index]));
    }
  });

  console.log(`Seeded ${birthdays.length} birthdays`);
}

// The owner of the demo data: the user with OWNER_EMAIL, created if missing
async function findOrCreateOwner(db: Db) {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!email) {
    throw new Error(
      "OWNER_EMAIL is not set: the seed creates the demo data for this user. Add OWNER_EMAIL=<your email> to .env",
    );
  }
  await db
    .insert(users)
    .values({ id: randomUUID(), name: "", email, emailVerified: true })
    .onConflictDoNothing();
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  return owner.id;
}

async function main() {
  const db = getDb();
  const ownerId = await findOrCreateOwner(db);
  const [{ total }] = await db
    .select({ total: count() })
    .from(contacts)
    .where(eq(contacts.userId, ownerId));
  if (total > 0) {
    console.log(`Contacts skipped: the owner already has ${total} contacts`);
  } else {
    await seedContacts(db, ownerId);
  }
  await seedGroups(db, ownerId);
  await seedBirthdays(db, ownerId);
}

async function seedContacts(db: Db, ownerId: string) {
  faker.seed(20261014);
  const seedContacts = Array.from({ length: CONTACT_COUNT }, buildContact);

  // All or nothing: an interrupted seed leaves the database empty and can simply be re-run
  const noteTotal = await db.transaction(async (tx) => {
    let insertedNotes = 0;
    for (let start = 0; start < seedContacts.length; start += BATCH_SIZE) {
      const batch = seedContacts.slice(start, start + BATCH_SIZE);
      await tx
        .insert(contacts)
        .values(batch.map((contact) => ({ ...contact.row, userId: ownerId })));
      const noteRows = batch.flatMap(buildNotes);
      if (noteRows.length > 0) {
        await tx.insert(notes).values(noteRows);
      }
      insertedNotes += noteRows.length;
    }
    return insertedNotes;
  });

  console.log(`Seeded ${CONTACT_COUNT} contacts and ${noteTotal} notes`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
