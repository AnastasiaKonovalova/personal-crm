import { fakerRU as faker } from "@faker-js/faker";
import { count } from "drizzle-orm";
import { closeDb, getDb } from "./index";
import { type contactCadence, contacts, notes } from "./schema";

// Fills an empty database with fictional contacts. Refuses to run if contacts already exist.

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
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya",
};

function transliterate(value: string) {
  return [...value.toLowerCase()].map((char) => TRANSLIT[char] ?? char).join("").replace(/[^a-z0-9]/g, "");
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
  return { cadence, contactOn: null, lastContactAt: new Date(Date.now() - daysSinceContact * DAY_MS) };
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
      ? new Date(keepInTouch.lastContactAt.getTime() - faker.number.int({ min: 1, max: 400 }) * DAY_MS)
      : keepInTouch.lastContactAt;

  return {
    row: {
      id: faker.string.uuid(),
      name: `${firstName} ${lastName}`,
      about: faker.helpers.maybe(() => faker.helpers.arrayElement(ROLES), { probability: 0.9 }) ?? null,
      howWeMet: faker.helpers.maybe(() => faker.helpers.arrayElement(ORIGINS), { probability: 0.85 }) ?? null,
      phone: faker.helpers.maybe(fakePhone, { probability: 0.8 }) ?? null,
      email: faker.helpers.maybe(() => fakeEmail(firstName, lastName), { probability: 0.7 }) ?? null,
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

async function main() {
  const db = getDb();
  const [{ total }] = await db.select({ total: count() }).from(contacts);
  if (total > 0) {
    console.log(`Seed skipped: the contacts table already has ${total} rows`);
    return;
  }

  faker.seed(20261014);
  const seedContacts = Array.from({ length: CONTACT_COUNT }, buildContact);

  // All or nothing: an interrupted seed leaves the database empty and can simply be re-run
  const noteTotal = await db.transaction(async (tx) => {
    let insertedNotes = 0;
    for (let start = 0; start < seedContacts.length; start += BATCH_SIZE) {
      const batch = seedContacts.slice(start, start + BATCH_SIZE);
      await tx.insert(contacts).values(batch.map((contact) => contact.row));
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
