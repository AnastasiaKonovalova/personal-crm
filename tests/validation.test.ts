import { describe, expect, it } from "vitest";
import {
  cadenceSchemaFor,
  contactSchema,
  contactSchemaFor,
  groupNameSchema,
  loginEmailSchema,
  noteSchema,
  normalizeGroupName,
} from "@/lib/validation";

const emptyContact = { name: "", about: "", howWeMet: "", phone: "", email: "" };

const TODAY = "2026-10-30";

describe("contactSchema", () => {
  it("requires a name", () => {
    const result = contactSchema.safeParse(emptyContact);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["name"]);
  });

  it("trims values and turns empty optional fields into null", () => {
    const result = contactSchema.parse({
      ...emptyContact,
      name: "  Анна Смирнова  ",
      about: "   ",
    });
    expect(result).toEqual({
      name: "Анна Смирнова",
      about: null,
      howWeMet: null,
      phone: null,
      email: null,
      cadence: null,
      contactOn: null,
      birthDay: null,
      birthMonth: null,
      birthYear: null,
      birthLeapDay: null,
      groupIds: [],
      newGroup: null,
    });
  });

  it("rejects a malformed email and phone", () => {
    const result = contactSchema.safeParse({
      ...emptyContact,
      name: "Анна",
      email: "anna@",
      phone: "позвонить",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual(["email", "phone"]);
  });

  it("accepts a filled contact", () => {
    const result = contactSchema.parse({
      name: "Анна Смирнова",
      about: "Дизайнер",
      howWeMet: "Курсы",
      phone: "+7 (000) 123-45-67",
      email: "anna@example.com",
    });
    expect(result.email).toBe("anna@example.com");
    expect(result.phone).toBe("+7 (000) 123-45-67");
  });
});

describe("contact cadence", () => {
  const named = { ...emptyContact, name: "Анна" };
  const errorsOf = (result: {
    success: boolean;
    error?: { issues: { path: PropertyKey[]; message: string }[] };
  }) =>
    Object.fromEntries(
      (result.error?.issues ?? []).map((issue) => [String(issue.path[0]), issue.message]),
    );

  it("saves a contact without a cadence as not set", () => {
    const result = contactSchema.parse(named);
    expect(result.cadence).toBeNull();
    expect(result.contactOn).toBeNull();
  });

  it("accepts every period and drops a stray date", () => {
    const result = contactSchemaFor(null, TODAY).parse({
      ...named,
      cadence: "month",
      contactOn: "2026-12-01",
    });
    expect(result.cadence).toBe("month");
    expect(result.contactOn).toBeNull();
  });

  it("rejects an unknown cadence", () => {
    const result = contactSchemaFor(null, TODAY).safeParse({ ...named, cadence: "daily" });
    expect(errorsOf(result)).toEqual({ cadence: "Некорректная частота" });
  });

  it("requires a date for a specific date", () => {
    const result = contactSchemaFor(null, TODAY).safeParse({
      ...named,
      cadence: "date",
      contactOn: "",
    });
    expect(errorsOf(result)).toEqual({ contactOn: "Укажи дату" });
  });

  it("rejects a malformed or impossible date", () => {
    for (const contactOn of ["15.11.2026", "2026-02-30"]) {
      const result = contactSchemaFor(null, TODAY).safeParse({
        ...named,
        cadence: "date",
        contactOn,
      });
      expect(errorsOf(result)).toEqual({ contactOn: "Некорректная дата" });
    }
  });

  it("rejects a past date when creating", () => {
    const result = contactSchemaFor(null, TODAY).safeParse({
      ...named,
      cadence: "date",
      contactOn: "2026-10-29",
    });
    expect(errorsOf(result)).toEqual({ contactOn: "Дата уже прошла" });
  });

  it("accepts today and a future date", () => {
    for (const contactOn of [TODAY, "2026-12-15"]) {
      const result = contactSchemaFor(null, TODAY).parse({ ...named, cadence: "date", contactOn });
      expect(result.contactOn).toBe(contactOn);
    }
  });

  it("lets the saved past date pass when other fields are edited", () => {
    const result = contactSchemaFor("2026-10-25", TODAY).parse({
      ...named,
      phone: "+7 (000) 123-45-67",
      cadence: "date",
      contactOn: "2026-10-25",
    });
    expect(result.contactOn).toBe("2026-10-25");
  });

  it("rejects replacing the saved past date with another past date", () => {
    const result = contactSchemaFor("2026-10-25", TODAY).safeParse({
      ...named,
      cadence: "date",
      contactOn: "2026-10-27",
    });
    expect(errorsOf(result)).toEqual({ contactOn: "Дата уже прошла" });
  });

  it("validates the frequency form of the card the same way", () => {
    const schema = cadenceSchemaFor("2026-10-25", TODAY);
    expect(schema.parse({ cadence: "date", contactOn: "2026-10-25" })).toEqual({
      cadence: "date",
      contactOn: "2026-10-25",
    });
    expect(schema.parse({ cadence: "week", contactOn: "2026-10-25" })).toEqual({
      cadence: "week",
      contactOn: null,
    });
    expect(errorsOf(schema.safeParse({ cadence: "date", contactOn: "2026-10-27" }))).toEqual({
      contactOn: "Дата уже прошла",
    });
  });
});

// Requirements «Проверка даты рождения» and «29 февраля в невисокосный год»
describe("contact birthday", () => {
  const BIRTHDAY_TODAY = "2026-11-22";
  const named = { ...emptyContact, name: "Анна" };
  const schema = contactSchemaFor(null, BIRTHDAY_TODAY);
  // Form fields as the browser sends them: strings, "" when not chosen
  const birthday = (birthDay: string, birthMonth: string, birthYear = "", birthLeapDay = "") => ({
    ...named,
    birthDay,
    birthMonth,
    birthYear,
    birthLeapDay,
  });
  const errorsOf = (input: Record<string, unknown>) =>
    Object.fromEntries(
      (schema.safeParse(input).error?.issues ?? []).map((issue) => [
        String(issue.path[0]),
        issue.message,
      ]),
    );
  const saved = (input: Record<string, unknown>) => {
    const { birthDay, birthMonth, birthYear, birthLeapDay } = schema.parse(input);
    return { birthDay, birthMonth, birthYear, birthLeapDay };
  };

  it("scenario «Контакт без даты рождения»: untouched or missing fields - no birthday", () => {
    const none = { birthDay: null, birthMonth: null, birthYear: null, birthLeapDay: null };
    expect(saved(birthday("", ""))).toEqual(none);
    expect(saved(named)).toEqual(none);
  });

  it("scenario «Дата без года»: 3 March", () => {
    expect(saved(birthday("3", "3"))).toEqual({
      birthDay: 3,
      birthMonth: 3,
      birthYear: null,
      birthLeapDay: null,
    });
  });

  it("saves a date with the year: 25 November 1990", () => {
    expect(saved(birthday("25", "11", " 1990 "))).toEqual({
      birthDay: 25,
      birthMonth: 11,
      birthYear: 1990,
      birthLeapDay: null,
    });
  });

  it("scenario «Год без дня и месяца»", () => {
    expect(errorsOf(birthday("", "", "1990"))).toEqual({ birthDay: "Укажи день и месяц" });
  });

  it("scenario «Месяц без дня», and a day without a month", () => {
    expect(errorsOf(birthday("", "4"))).toEqual({ birthDay: "Укажи день и месяц" });
    expect(errorsOf(birthday("3", ""))).toEqual({ birthDay: "Укажи день и месяц" });
  });

  it("scenario «Несуществующий день»: 31 April", () => {
    expect(errorsOf(birthday("31", "4"))).toEqual({ birthDay: "Такой даты нет" });
    expect(errorsOf(birthday("31", "4", "1990"))).toEqual({ birthDay: "Такой даты нет" });
  });

  it("scenario «29 февраля в невисокосный год»: 29 February 2023", () => {
    expect(errorsOf(birthday("29", "2", "2023", "feb_28"))).toEqual({
      birthDay: "Такой даты нет",
    });
  });

  it("scenario «29 февраля без года»", () => {
    expect(saved(birthday("29", "2", "", "feb_28"))).toMatchObject({
      birthDay: 29,
      birthMonth: 2,
      birthYear: null,
    });
  });

  it("scenario «Дата в будущем»: on 22 November 2026 - 1 December 2026; today itself is fine", () => {
    expect(errorsOf(birthday("1", "12", "2026"))).toEqual({ birthDay: "Проверь год" });
    expect(errorsOf(birthday("1", "1", "2027"))).toEqual({ birthDay: "Проверь год" });
    expect(saved(birthday("22", "11", "2026")).birthYear).toBe(2026);
  });

  it("scenario «Слишком ранний год»: 1890; 1900 is fine", () => {
    expect(errorsOf(birthday("1", "5", "1890"))).toEqual({ birthDay: "Проверь год" });
    expect(saved(birthday("1", "5", "1900")).birthYear).toBe(1900);
  });

  it("rejects a year that is not a number", () => {
    expect(errorsOf(birthday("1", "5", "19ab"))).toEqual({ birthDay: "Проверь год" });
  });

  it("scenario «Запрос в обход формы»: day 32, month 13, an unknown choice for 29 February", () => {
    expect(schema.safeParse(birthday("32", "1")).success).toBe(false);
    expect(schema.safeParse(birthday("0", "1")).success).toBe(false);
    expect(schema.safeParse(birthday("1", "13")).success).toBe(false);
    expect(schema.safeParse(birthday("1.5", "1")).success).toBe(false);
    expect(schema.safeParse(birthday("29", "2", "", "mar_2")).success).toBe(false);
  });

  it("scenario «Выбор по умолчанию»: 29 February without a choice - 28 February", () => {
    expect(saved(birthday("29", "2")).birthLeapDay).toBe("feb_28");
  });

  it("scenario «Выбор 1 марта»: 29 February 1992 with 1 March", () => {
    expect(saved(birthday("29", "2", "1992", "mar_1"))).toEqual({
      birthDay: 29,
      birthMonth: 2,
      birthYear: 1992,
      birthLeapDay: "mar_1",
    });
  });

  it("scenario «Выбор без JavaScript при другой дате»: 3 March with 1 March ticked - the choice is not saved", () => {
    expect(saved(birthday("3", "3", "", "mar_1")).birthLeapDay).toBeNull();
  });
});

describe("noteSchema", () => {
  it("rejects an empty note", () => {
    expect(noteSchema.safeParse({ body: "   " }).success).toBe(false);
  });

  it("keeps the note text trimmed", () => {
    expect(noteSchema.parse({ body: "  Созвонились  " }).body).toBe("Созвонились");
  });
});

const GROUP_A = "7d4f1c2e-8a3b-4c5d-9e6f-0a1b2c3d4e5f";
const GROUP_B = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

describe("groupNameSchema", () => {
  const errorOf = (name: string) => groupNameSchema.safeParse({ name }).error?.issues[0]?.message;

  it("rejects an empty name (scenario «Пустое имя»)", () => {
    expect(errorOf("")).toBe("Укажи название");
    expect(errorOf("   ")).toBe("Укажи название");
  });

  it("rejects a name longer than 50 characters (scenario «Слишком длинное имя»)", () => {
    expect(errorOf("я".repeat(51))).toBe("Не длиннее 50 символов");
  });

  it("accepts a name of exactly 50 characters after trimming", () => {
    expect(groupNameSchema.parse({ name: `  ${"я".repeat(50)}  ` }).name).toBe("я".repeat(50));
  });
});

describe("normalizeGroupName", () => {
  it("treats «Ёлка» and «елка» as one name", () => {
    expect(normalizeGroupName("Ёлка")).toBe(normalizeGroupName("елка"));
  });

  it("ignores case and surrounding spaces", () => {
    expect(normalizeGroupName("  Друзья ")).toBe(normalizeGroupName("друзья"));
  });

  it("keeps different names different", () => {
    expect(normalizeGroupName("Теннис")).not.toBe(normalizeGroupName("Теннис по субботам"));
  });
});

describe("contact groups in the contact form", () => {
  const named = { ...emptyContact, name: "Анна" };

  it("defaults to no groups and no new group", () => {
    const result = contactSchema.parse(named);
    expect(result.groupIds).toEqual([]);
    expect(result.newGroup).toBeNull();
  });

  it("drops duplicate group ids", () => {
    const result = contactSchema.parse({ ...named, groupIds: [GROUP_A, GROUP_B, GROUP_A] });
    expect(result.groupIds).toEqual([GROUP_A, GROUP_B]);
  });

  it("rejects a malformed group id", () => {
    const result = contactSchema.safeParse({ ...named, groupIds: ["not-a-uuid"] });
    expect(result.error?.issues[0]?.path[0]).toBe("groupIds");
  });

  it("trims the new group name and treats spaces as no new group", () => {
    expect(contactSchema.parse({ ...named, newGroup: "  Аналитики " }).newGroup).toBe("Аналитики");
    expect(contactSchema.parse({ ...named, newGroup: "   " }).newGroup).toBeNull();
  });

  it("rejects a new group name longer than 50 characters (scenario «Ошибка имени новой группы»)", () => {
    const result = contactSchema.safeParse({ ...named, newGroup: "я".repeat(51) });
    expect(result.error?.issues.map((issue) => [issue.path[0], issue.message])).toEqual([
      ["newGroup", "Не длиннее 50 символов"],
    ]);
  });

  it("reports the contact name error alongside the new group (scenario «Ошибка формы не теряет группы»)", () => {
    const result = contactSchema.safeParse({
      ...emptyContact,
      groupIds: [GROUP_A],
      newGroup: "Аналитики",
    });
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(["name"]);
  });
});

// The email of a sign-in request: one rule for the form and for the server hook
describe("loginEmailSchema", () => {
  const emailOf = (email: unknown) => loginEmailSchema.parse({ email }).email;
  const errorsOf = (input: unknown) =>
    loginEmailSchema.safeParse(input).error?.issues.map((issue) => [issue.path[0], issue.message]);

  it("trims the spaces and lowers the case (scenario «Почта с пробелами и большими буквами»)", () => {
    expect(emailOf(" Anna@Example.COM ")).toBe("anna@example.com");
    expect(emailOf("\tBoris@Example.com\n")).toBe("boris@example.com");
  });

  it("keeps a normal address as it is", () => {
    expect(emailOf("anna.smirnova+crm@mail.example.org")).toBe(
      "anna.smirnova+crm@mail.example.org",
    );
  });

  it("rejects an address that is not complete (scenario «Неверный адрес в форме»)", () => {
    expect(errorsOf({ email: "anna@" })).toEqual([["email", "Проверь адрес почты"]]);
    expect(errorsOf({ email: "anna@example" })).toEqual([["email", "Проверь адрес почты"]]);
    expect(errorsOf({ email: "@example.com" })).toEqual([["email", "Проверь адрес почты"]]);
  });

  it("rejects an empty email and spaces only (scenario «Пустая почта»)", () => {
    expect(errorsOf({ email: "" })).toEqual([["email", "Проверь адрес почты"]]);
    expect(errorsOf({ email: "   " })).toEqual([["email", "Проверь адрес почты"]]);
  });

  it("rejects what a request outside the form may send (scenario «Неверный адрес в запросе мимо формы»)", () => {
    expect(errorsOf({ email: "not-an-email" })).toEqual([["email", "Проверь адрес почты"]]);
    expect(errorsOf({ email: "anna@example.com, boris@example.com" })).toEqual([
      ["email", "Проверь адрес почты"],
    ]);
    // A missing or non-text email gets the same message, not a technical one
    expect(errorsOf({})).toEqual([["email", "Проверь адрес почты"]]);
    expect(errorsOf({ email: 42 })).toEqual([["email", "Проверь адрес почты"]]);
    expect(errorsOf({ email: null })).toEqual([["email", "Проверь адрес почты"]]);
  });

  it("rejects an address longer than 254 characters", () => {
    const long = `${"a".repeat(250)}@example.com`;
    expect(errorsOf({ email: long })).toEqual([["email", "Проверь адрес почты"]]);
  });
});
